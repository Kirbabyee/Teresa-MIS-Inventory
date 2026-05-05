-- Add section_id column to computers_components
ALTER TABLE computers_components ADD COLUMN section_id uuid;

-- Get the comlab tab id
DO $$ 
DECLARE
  v_tab_id uuid;
BEGIN
  SELECT id INTO v_tab_id FROM inventory_tabs WHERE slug = 'comlab' LIMIT 1;
  
  IF v_tab_id IS NULL THEN
    -- Create comlab tab if it doesn't exist
    INSERT INTO inventory_tabs (name, slug, description, sort_order)
    VALUES ('Comlab', 'comlab', 'Computer laboratory inventory tabs.', 2)
    RETURNING id INTO v_tab_id;
  END IF;

  -- Create missing sections for all distinct lab_numbers in computers_components
  INSERT INTO inventory_sections (tab_id, name, slug, description, sort_order, updated_at)
  SELECT DISTINCT 
    v_tab_id,
    'Laboratory ' || lab_number,
    'laboratory-' || lab_number,
    '',
    lab_number,
    now()
  FROM computers_components
  WHERE lab_number IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM inventory_sections
      WHERE tab_id = v_tab_id
        AND sort_order = computers_components.lab_number
    )
  ORDER BY lab_number;
END $$;

-- Backfill section_id from lab_number
UPDATE computers_components cc
SET section_id = s.id
FROM inventory_sections s
JOIN inventory_tabs t ON s.tab_id = t.id AND t.slug = 'comlab'
WHERE s.sort_order = cc.lab_number
  AND s.tab_id = t.id
  AND cc.lab_number IS NOT NULL;
