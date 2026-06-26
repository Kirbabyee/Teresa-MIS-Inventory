-- =============================================================================
-- Item Transfer RPC
-- Atomically transfers a quantity of an item from one inventory table/section
-- to another. Supports same-table section moves and cross-table transfers.
--
-- MERGE BEHAVIOR:
--   Before inserting a new row, we search for an existing "merge target" row
--   in the destination that represents the same item. Match criteria:
--     1. Same item_number or computer_number (identifier column) — if present
--     2. Fallback: all non-system, non-quantity columns match (name, brand, etc.)
--   If a merge target is found, we ADD the transfer quantity to it instead of
--   creating a duplicate row.
--
-- SCHEMA SAFETY:
--   Columns that exist in source but NOT in destination are silently dropped
--   via _filter_jsonb_to_table_columns to avoid schema-cache mismatch errors.
-- =============================================================================

-- Helper: log a change into {table_name}_logs if the table exists
CREATE OR REPLACE FUNCTION _log_inventory_transfer(
  p_table_name  TEXT,
  p_action      TEXT,
  p_old_data    JSONB,
  p_new_data    JSONB,
  p_section_id  UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  log_table TEXT;
BEGIN
  log_table := p_table_name || '_logs';

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = log_table
  ) THEN
    EXECUTE format(
      'INSERT INTO %I (action, record_id, old_data, new_data, section_id, change_ts)
       VALUES ($1, $2, $3, $4, $5, now())',
      log_table
    )
    USING p_action, jsonb_build_object('id', p_old_data->'id'), p_old_data, p_new_data, p_section_id;
  END IF;
END;
$$;

-- Helper: strip keys from a JSONB object that do not exist as columns
-- in the given table. Prevents schema-cache mismatch errors when
-- using jsonb_populate_record across tables with different schemas.
CREATE OR REPLACE FUNCTION _filter_jsonb_to_table_columns(
  p_row_jsonb   JSONB,
  p_table_name  TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_result JSONB := '{}';
  v_key    TEXT;
  v_val    JSONB;
BEGIN
  FOR v_key, v_val IN
    SELECT key, value FROM jsonb_each(p_row_jsonb)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = p_table_name
        AND column_name = v_key
    ) THEN
      v_result := jsonb_set(v_result, ARRAY[v_key], v_val);
    END IF;
  END LOOP;
  RETURN v_result;
END;
$$;

-- Helper: build a JSONB "fingerprint" of a row for merge matching.
-- Returns a JSONB object containing only the non-system, non-quantity
-- columns (the "identity" columns that define whether two rows are
-- the same item). The fingerprint is used to find merge targets.
CREATE OR REPLACE FUNCTION _build_merge_fingerprint(
  p_row_jsonb        JSONB,
  p_table_name       TEXT,
  p_quantity_column  TEXT DEFAULT 'quantity'
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_result  JSONB := '{}';
  v_key     TEXT;
  v_val     JSONB;
  v_skip    TEXT[];
BEGIN
  v_skip := ARRAY['id', 'section_id', 'created_at', 'updated_at', 'sort_order', p_quantity_column];

  FOR v_key, v_val IN
    SELECT key, value FROM jsonb_each(p_row_jsonb)
  LOOP
    -- Skip system and quantity columns
    IF v_key = ANY(v_skip) THEN CONTINUE; END IF;
    -- Only include columns that exist in the target table
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = p_table_name
        AND column_name = v_key
    ) THEN
      -- Normalize: treat empty strings and null as equivalent for matching
      IF v_val IS NULL OR (pg_typeof(v_val) = 'text'::regtype AND v_val = '""') THEN
        v_result := jsonb_set(v_result, ARRAY[v_key], 'null');
      ELSE
        v_result := jsonb_set(v_result, ARRAY[v_key], v_val);
      END IF;
    END IF;
  END LOOP;
  RETURN v_result;
END;
$$;

-- Main RPC: transfer_inventory_item
CREATE OR REPLACE FUNCTION transfer_inventory_item(
  p_source_item_id   UUID,
  p_source_table     TEXT,
  p_source_section_id UUID,
  p_dest_table       TEXT,
  p_dest_section_id  UUID,
  p_transfer_qty     INT,
  p_quantity_column  TEXT DEFAULT 'quantity'
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_source_row       RECORD;
  v_source_jsonb     JSONB;
  v_source_qty       INT;
  v_remaining_qty    INT;
  v_dest_id          UUID;
  v_dest_total_qty   INT;
  v_source_old_data  JSONB;
  v_source_new_data  JSONB;
  v_dest_old_data    JSONB;
  v_dest_new_data    JSONB;
  v_insert_row       JSONB;
  v_same_table       BOOLEAN;
  v_same_section     BOOLEAN;
  v_fingerprint      JSONB;
  v_ident_col        TEXT;
  v_ident_val        TEXT;
BEGIN
  -- ── Guard: must transfer positive quantity ──
  IF p_transfer_qty IS NULL OR p_transfer_qty <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transfer quantity must be a positive integer.');
  END IF;

  -- ── Guard: source and destination tables must exist ──
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = p_source_table) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Source table does not exist: ' || p_source_table);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = p_dest_table) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Destination table does not exist: ' || p_dest_table);
  END IF;

  v_same_table   := (p_source_table = p_dest_table);
  v_same_section := (v_same_table AND p_source_section_id = p_dest_section_id);

  -- ── Guard: cannot transfer to the same section ──
  IF v_same_section THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot transfer an item to the same section it is already in.');
  END IF;

  -- ── Fetch source row ──
  EXECUTE format('SELECT * FROM %I WHERE id = $1 AND section_id = $2', p_source_table)
    INTO v_source_row
    USING p_source_item_id, p_source_section_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Source item not found in the specified section.');
  END IF;

  v_source_jsonb := to_jsonb(v_source_row);

  -- ── Read current quantity from the source row ──
  EXECUTE format('SELECT ($1).%I', p_quantity_column)
    INTO v_source_qty
    USING v_source_row;

  IF v_source_qty IS NULL OR NOT (v_source_qty >= p_transfer_qty) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Insufficient quantity. Available: %s, Requested: %s', COALESCE(v_source_qty, 0), p_transfer_qty)
    );
  END IF;

  v_remaining_qty := v_source_qty - p_transfer_qty;

  -- ── Build the insert row JSONB (filtered to destination columns) ──
  v_insert_row := v_source_jsonb
    - 'id' - 'created_at' - 'updated_at' - 'sort_order';

  v_insert_row := jsonb_set(v_insert_row, ARRAY['section_id'], to_jsonb(p_dest_section_id));
  v_insert_row := jsonb_set(v_insert_row, ARRAY[p_quantity_column], to_jsonb(p_transfer_qty));
  v_insert_row := _filter_jsonb_to_table_columns(v_insert_row, p_dest_table);

  -- ══════════════════════════════════════════════════════════════════════
  -- MERGE TARGET DETECTION
  -- Find an existing row in the destination that is the SAME item
  -- (all non-system, non-qty fields match). We never merge just on
  -- item_number alone — different items can share the same number
  -- after cross-table transfers.
  -- ══════════════════════════════════════════════════════════════════════
  v_dest_id := NULL;

  -- Build the source fingerprint (all non-system, non-qty columns)
  v_fingerprint := _build_merge_fingerprint(v_source_jsonb, p_dest_table, p_quantity_column);

  IF v_fingerprint != '{}' THEN
    -- Narrow candidates using identifier column for efficiency,
    -- then verify with full fingerprint comparison.
    v_ident_col := NULL;
    v_ident_val := NULL;

    IF v_source_jsonb ? 'item_number' AND (v_source_jsonb->>'item_number') IS NOT NULL THEN
      v_ident_col := 'item_number';
      v_ident_val := v_source_jsonb->>'item_number';
    ELSIF v_source_jsonb ? 'computer_number' AND (v_source_jsonb->>'computer_number') IS NOT NULL THEN
      v_ident_col := 'computer_number';
      v_ident_val := v_source_jsonb->>'computer_number';
    END IF;

    -- Scan candidate rows in the destination section
    -- If we have an identifier, use it to narrow the search; otherwise scan all.
    IF v_ident_col IS NOT NULL AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = p_dest_table
        AND column_name = v_ident_col
    ) THEN
      -- Narrowed search: only rows with the same identifier
      FOR v_dest_id, v_dest_total_qty IN
        EXECUTE format(
          'SELECT id, %I FROM %I WHERE section_id = $1 AND id != $2 AND %I = $3',
          p_quantity_column, p_dest_table, v_ident_col
        )
        USING p_dest_section_id, p_source_item_id, v_ident_val
      LOOP
        DECLARE
          v_cand_jsonb JSONB;
          v_cand_fp    JSONB;
        BEGIN
          EXECUTE format('SELECT to_jsonb(t) FROM %I t WHERE id = $1', p_dest_table)
            INTO v_cand_jsonb USING v_dest_id;
          v_cand_fp := _build_merge_fingerprint(v_cand_jsonb, p_dest_table, p_quantity_column);
          IF v_cand_fp = v_fingerprint THEN
            EXIT;  -- Found the merge target
          ELSE
            v_dest_id := NULL;
            v_dest_total_qty := NULL;
          END IF;
        END;
      END LOOP;
    ELSE
      -- Full scan: no identifier to narrow with
      FOR v_dest_id, v_dest_total_qty IN
        EXECUTE format(
          'SELECT id, %I FROM %I WHERE section_id = $1 AND id != $2',
          p_quantity_column, p_dest_table
        )
        USING p_dest_section_id, p_source_item_id
      LOOP
        DECLARE
          v_cand_jsonb JSONB;
          v_cand_fp    JSONB;
        BEGIN
          EXECUTE format('SELECT to_jsonb(t) FROM %I t WHERE id = $1', p_dest_table)
            INTO v_cand_jsonb USING v_dest_id;
          v_cand_fp := _build_merge_fingerprint(v_cand_jsonb, p_dest_table, p_quantity_column);
          IF v_cand_fp = v_fingerprint THEN
            EXIT;  -- Found the merge target
          ELSE
            v_dest_id := NULL;
            v_dest_total_qty := NULL;
          END IF;
        END;
      END LOOP;
    END IF;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════
  -- PERFORM THE TRANSFER
  -- ══════════════════════════════════════════════════════════════════════
  IF v_dest_id IS NOT NULL THEN
    -- ── MERGE: add transfer qty to existing destination row ──
    v_dest_total_qty := COALESCE(v_dest_total_qty, 0) + p_transfer_qty;

    EXECUTE format('SELECT to_jsonb(t) FROM %I t WHERE id = $1', p_dest_table)
      INTO v_dest_old_data USING v_dest_id;

    EXECUTE format(
      'UPDATE %I SET %I = $1, updated_at = now() WHERE id = $2 RETURNING to_jsonb(%I)',
      p_dest_table, p_quantity_column, p_dest_table
    ) INTO v_dest_new_data USING v_dest_total_qty, v_dest_id;

    PERFORM _log_inventory_transfer(p_dest_table, 'UPDATE', v_dest_old_data, v_dest_new_data, p_dest_section_id);
  ELSE
    -- ── INSERT: no existing match — create a new row ──
    -- Reassign identifier (item_number / computer_number) to the next
    -- available value in the destination table to avoid collisions.
    IF v_ident_col IS NOT NULL AND v_insert_row ? v_ident_col THEN
      DECLARE
        v_next_ident INT;
        v_max_ident  INT;
      BEGIN
        -- Find max identifier in destination table (for cross-table or same-table)
        IF v_same_table THEN
          EXECUTE format(
            'SELECT COALESCE(MAX(%I), 0) FROM %I WHERE section_id = $1',
            v_ident_col, p_dest_table
          ) INTO v_max_ident USING p_dest_section_id;
        ELSE
          EXECUTE format(
            'SELECT COALESCE(MAX(%I), 0) FROM %I',
            v_ident_col, p_dest_table
          ) INTO v_max_ident;
        END IF;
        v_next_ident := v_max_ident + 1;
        v_insert_row := jsonb_set(v_insert_row, ARRAY[v_ident_col], to_jsonb(v_next_ident));
      END;
    END IF;

    EXECUTE format(
      'INSERT INTO %I SELECT * FROM jsonb_populate_record(NULL::%I, $1) RETURNING id',
      p_dest_table, p_dest_table
    ) INTO v_dest_id USING v_insert_row;

    IF v_dest_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Failed to insert row into destination table.');
    END IF;

    EXECUTE format('SELECT to_jsonb(t) FROM %I t WHERE id = $1', p_dest_table)
      INTO v_dest_new_data USING v_dest_id;

    PERFORM _log_inventory_transfer(p_dest_table, 'INSERT', NULL, v_dest_new_data, p_dest_section_id);
    v_dest_total_qty := p_transfer_qty;
  END IF;

  -- ── Update or delete source row ──
  v_source_old_data := v_source_jsonb;

  IF v_remaining_qty <= 0 THEN
    EXECUTE format('DELETE FROM %I WHERE id = $1', p_source_table) USING p_source_item_id;
    PERFORM _log_inventory_transfer(p_source_table, 'DELETE', v_source_old_data, NULL, p_source_section_id);
  ELSE
    EXECUTE format(
      'UPDATE %I SET %I = $1, updated_at = now() WHERE id = $2 RETURNING to_jsonb(%I)',
      p_source_table, p_quantity_column, p_source_table
    ) INTO v_source_new_data USING v_remaining_qty, p_source_item_id;
    PERFORM _log_inventory_transfer(p_source_table, 'UPDATE', v_source_old_data, v_source_new_data, p_source_section_id);
  END IF;

  RETURN jsonb_build_object(
    'success',           true,
    'source_id',         p_source_item_id,
    'dest_id',           v_dest_id,
    'source_remaining',  v_remaining_qty,
    'dest_total_qty',    v_dest_total_qty
  );
END;
$$;
