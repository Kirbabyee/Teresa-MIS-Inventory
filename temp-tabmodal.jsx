function TabModal({ tab, onClose, onSave }) {
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const initialSnapshotRef = useRef("");
  const [tabForm, setTabForm] = useState({
    name: tab?.name || "",
    slug: tab?.slug || "",
    description: tab?.description || "",
  });
  const [sections, setSections] = useState(tab?.sections || []);
  const [columns, setColumns] = useState(tab?.columns || []);
  const [editingSectionIndex, setEditingSectionIndex] = useState(null);
  const [editingColumnIndex, setEditingColumnIndex] = useState(null);
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [showColumnModal, setShowColumnModal] = useState(false);
  const [sectionToEdit, setSectionToEdit] = useState(null);
  const [columnToEdit, setColumnToEdit] = useState(null);
  const [isTabNameTouched, setIsTabNameTouched] = useState(false);

  const tabValidation = useMemo(() => {
    const errors = { name: "", columns: "" };
    const trimmedName = tabForm.name.trim();

    if (!trimmedName) {
      errors.name = "Tab name is required.";
    } else if (!hasOnlyLettersNumbers(trimmedName)) {
      errors.name = "Tab name may only contain letters, numbers, and spaces.";
    }

    if (!tab?.id && columns.length === 0) {
      errors.columns = "New tabs must include at least one column.";
    }

    return errors;
  }, [tabForm.name, columns, tab?.id]);

  const isSaveDisabled = Boolean(tabValidation.name || tabValidation.columns);

  const buildTabSnapshot = (currentTabForm, currentSections, currentColumns) =>
    JSON.stringify({
      tabForm: {
        name: String(currentTabForm.name || ""),
        slug: String(currentTabForm.slug || ""),
        description: String(currentTabForm.description || ""),
      },
      sections: (currentSections || []).map((section) => ({
        id: section?.id || null,
        name: String(section?.name || ""),
        slug: String(section?.slug || ""),
        description: String(section?.description || ""),
      })),
      columns: (currentColumns || []).map((column) => {
        const normalized = normalizeColumnConfig(column);
        return {
          key: normalized.key,
          label: normalized.label,
          data_type: normalized.data_type,
          visible: normalized.visible,
          subColumns: (normalized.subColumns || []).map((subColumn) => ({
            key: String(subColumn?.key || ""),
            label: String(subColumn?.label || ""),
          })),
        };
      }),
    });

  const hasUnsavedChanges =
    initialSnapshotRef.current !== buildTabSnapshot(tabForm, sections, columns);

  useEffect(() => {
    const nextTabForm = {
      name: tab?.name || "",
      slug: tab?.slug || "",
      description: tab?.description || "",
    };
    const nextSections = tab?.sections || [];
    const nextColumns = tab?.id ? [] : tab?.columns || [];

    setTabForm(nextTabForm);
    setSections(nextSections);
    setColumns(nextColumns);
    setEditingSectionIndex(null);
    setEditingColumnIndex(null);
    setSectionToEdit(null);
    setColumnToEdit(null);
    setShowSectionModal(false);
    setShowColumnModal(false);
    setShowDiscardConfirm(false);
    setShowSaveConfirm(false);
    setIsTabNameTouched(false);
    initialSnapshotRef.current = buildTabSnapshot(nextTabForm, nextSections, nextColumns);
  }, [tab]);

  useEffect(() => {
    let cancelled = false;

    const loadTabConfig = async () => {
      if (!tab?.id) return;

      try {
        const config = await getTabTableConfig(tab.id);
        if (!cancelled && config?.columns) {
          setColumns((config.columns || []).filter((column) => column && column.key).map((column) => normalizeColumnConfig(column)));
        }
      } catch (error) {
        console.warn("Failed to load tab config:", error);
      }
    };

    loadTabConfig();

    return () => {
      cancelled = true;
    };
  }, [tab?.id]);

  const editSection = (index) => {
    const current = sections[index];
    if (!current) return;
    setEditingSectionIndex(index);
    setSectionToEdit(current);
    setShowSectionModal(true);
  };

  const deleteSection = (index) => {
    setSections((currentSections) => currentSections.filter((_, currentIndex) => currentIndex !== index));
    if (editingSectionIndex === index) setEditingSectionIndex(null);
  };

  const editColumn = (index) => {
    const current = columns[index];
    if (!current) return;
    setEditingColumnIndex(index);
    setColumnToEdit(current);
    setShowColumnModal(true);
  };

  const deleteColumn = (index) => {
    setColumns((currentColumns) => currentColumns.filter((_, currentIndex) => currentIndex !== index));
    if (editingColumnIndex === index) setEditingColumnIndex(null);
  };

  const saveSectionFromModal = async (sectionForm) => {
    const nextSection = {
      ...(sectionToEdit || {}),
      name: String(sectionForm.name || "").trim(),
      slug: slugify(sectionForm.name || ""),
      description: String(sectionForm.description || "").trim(),
    };

    setSections((currentSections) => {
      if (editingSectionIndex === null) return [...currentSections, nextSection];

      return currentSections.map((section, index) =>
        index === editingSectionIndex ? nextSection : section
      );
    });
    setErrors((current) => ({ ...current, sections: "" }));
    setShowSectionModal(false);
    setSectionToEdit(null);
    setEditingSectionIndex(null);
  };

  const saveColumnFromModal = async (columnForm) => {
    const normalizedColumn = normalizeColumnConfig({
      ...(columnToEdit || {}),
      ...columnForm,
      key: slugify(columnForm.label || "").replace(/-/g, "_"),
      label: String(columnForm.label || "").trim(),
      subColumns: (columnForm.subColumns || []).map((subColumn) => ({
        ...subColumn,
        key: slugify(subColumn.label || subColumn.key || "").replace(/-/g, "_"),
        label: String(subColumn.label || "").trim(),
      })),
    });

    setColumns((currentColumns) => {
      if (editingColumnIndex === null) return [...currentColumns, normalizedColumn];

      return currentColumns.map((column, index) =>
        index === editingColumnIndex ? normalizedColumn : column
      );
    });
    setErrors((current) => ({ ...current, columns: "" }));
    setShowColumnModal(false);
    setColumnToEdit(null);
    setEditingColumnIndex(null);
  };

  const handleSaveTab = () => {
    onSave({ ...tabForm, sections, columns });
  };

  const requestClose = () => {
    if (hasUnsavedChanges) {
      setShowDiscardConfirm(true);
      return;
    }

    onClose();
  };

  const confirmDiscard = () => {
    setShowDiscardConfirm(false);
    onClose();
  };

  const cancelDiscard = () => {
    setShowDiscardConfirm(false);
  };

  const requestSave = () => {
    if (tabValidation.name || tabValidation.columns) {
      return;
    }

    if (hasUnsavedChanges) {
      setShowSaveConfirm(true);
      return;
    }

    handleSaveTab();
  };

  const confirmSave = async () => {
    setShowSaveConfirm(false);
    await handleSaveTab();
  };

  const cancelSave = () => {
    setShowSaveConfirm(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 p-5">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">{tab ? "Edit inventory tab" : "Add inventory tab"}</h3>
            </div>
            <button type="button" onClick={requestClose} className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="grid gap-4 px-5 py-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Tab name</label>
            <Input
              className={`mt-2 ${
                isTabNameTouched
                  ? tabValidation.name
                    ? "border-red-500 bg-red-50 focus:border-red-500"
                    : "border-green-500 bg-green-50 focus:border-green-500"
                  : ""
              }`}
              value={tabForm.name}
              onChange={(event) => setTabForm((current) => ({ ...current, name: event.target.value }))}
              onBlur={() => setIsTabNameTouched(true)}
              placeholder=""
            />
            {isTabNameTouched && tabValidation.name ? (
              <p className="mt-2 text-sm text-rose-600">{tabValidation.name}</p>
            ) : null}
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Description (Optional)</label>
            <Textarea
              className="mt-2 min-h-[96px]"
              value={tabForm.description}
              onChange={(event) => setTabForm((current) => ({ ...current, description: event.target.value }))}
              placeholder=""
            />
          </div>
        </div>

        <div className="border-t border-slate-200 px-5 py-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">Sections</h4>
              <p className="text-sm text-slate-500"></p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSectionToEdit(null);
                setEditingSectionIndex(null);
                setShowSectionModal(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-[#4a1111] px-3 py-2 text-sm font-medium text-white hover:bg-[#3f0f0f]"
            >
              <Plus className="h-4 w-4" />
              Add Section
            </button>
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Section Name</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {sections.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-500" colSpan={3}>
                      Add atleast one or more sections.
                    </td>
                  </tr>
                ) : (
                  sections.map((currentSection, index) => (
                    <tr key={currentSection.id || currentSection.slug || index} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{currentSection.name}</td>
                      <td className="px-4 py-3 text-slate-600">{currentSection.description || "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => editSection(index)} className={iconButtonClass} title="Edit Section">
                            <Edit className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => deleteSection(index)} className={iconButtonClass} title="Delete Section">
                            <Trash2 className="h-4 w-4 text-rose-500" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="border-t border-slate-200 px-5 py-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">Columns</h4>
              {tabValidation.columns ? (
                <p className="mt-1 text-sm text-rose-600">{tabValidation.columns}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => {
                setColumnToEdit(null);
                setEditingColumnIndex(null);
                setShowColumnModal(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-[#4a1111] px-3 py-2 text-sm font-medium text-white hover:bg-[#3f0f0f]"
            >
              <Plus className="h-4 w-4" />
              Add Column
            </button>
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                <tr>
                 
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {columns.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-500" colSpan={5}>
                       Add at least one column.
                    </td>
                  </tr>
                ) : (
                  columns.map((currentColumn, index) => (
                    <tr key={currentColumn.id || currentColumn.key || index} className="hover:bg-slate-50">          
                      <td className="px-4 py-3 text-slate-600">{currentColumn.label}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => editColumn(index)} className={iconButtonClass} title="Edit Column">
                            <Edit className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => deleteColumn(index)} className={iconButtonClass} title="Delete Column">
                            <Trash2 className="h-4 w-4 text-rose-500" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="sticky bottom-0 z-10 flex justify-end gap-3 border-t border-slate-200 bg-white px-5 py-4">
            <button type="button" onClick={requestClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button
              type="button"
              onClick={requestSave}
              disabled={isSaveDisabled}
              className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save Tab
            </button>
          </div>
        </div>
      </div>

      {showDiscardConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/5">
            <h3 className="text-lg font-semibold text-slate-900">Discard changes?</h3>
            <p className="mt-2 text-sm text-slate-600">
              You have unsaved changes. If you close now, those changes will be lost.
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button type="button" onClick={cancelDiscard} className="rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
                Keep editing
              </button>
              <button type="button" onClick={confirmDiscard} className="rounded-md bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700">
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {showSaveConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/5">
            <h3 className="text-lg font-semibold text-slate-900">Save changes?</h3>
            <p className="mt-2 text-sm text-slate-600">
              Are you sure you want to save these changes?
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button type="button" onClick={cancelSave} className="rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
                Cancel
              </button>
              <button type="button" onClick={confirmSave} className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showSectionModal && (
        <SectionModal
          section={sectionToEdit}
          onClose={() => {
            setShowSectionModal(false);
            setSectionToEdit(null);
            setEditingSectionIndex(null);
          }}
          onSave={(form) => {
            try {
              console.log("SectionModal onSave called with:", form);
              
              const name = form.name.trim();
              console.log("Section name:", name);
              
              if (!name) {
                console.warn("Section name is empty, returning");
                alert("Section name is required.");
                return;
              }

              setSections((currentSections) => {
                const currentSection = editingSectionIndex !== null ? currentSections[editingSectionIndex] : null;
                const nextSlug = makeUniqueSlug(
                  name,
                  currentSections.map((section) => section.slug),
                  currentSection?.slug || "",
                );

                const nextSection = currentSection
                  ? { ...currentSection, name, slug: nextSlug, description: form.description.trim() }
                  : { name, slug: nextSlug, description: form.description.trim() };

                const nextSections = [...currentSections];
                if (editingSectionIndex !== null && nextSections[editingSectionIndex]) {
                  console.log("Updating existing section at index:", editingSectionIndex);
                  nextSections[editingSectionIndex] = nextSection;
                } else {
                  console.log("Adding new section to sections array");
                  nextSections.push(nextSection);
                }

                console.log("Updated sections:", nextSections);
                return nextSections;
              });

              console.log("Section saved successfully, closing modal");
              setShowSectionModal(false);
              setSectionToEdit(null);
              setEditingSectionIndex(null);
            } catch (err) {
              console.error("Error saving section:", err);
              alert(`Error saving section: ${err.message}`);
            }
          }}
        />
      )}
      {showColumnModal && (
        <ColumnRowModal
          column={columnToEdit}
          existingColumns={columns}
          onClose={() => {
            setShowColumnModal(false);
            setColumnToEdit(null);
            setEditingColumnIndex(null);
          }}
          onSave={(colForm) => {
            try {
              console.log("ColumnRowModal onSave called with:", colForm);
              
              const label = (colForm.label || "").trim();
              console.log("Column label:", label);
              
              if (!label) {
                console.warn("Column label is empty, returning");
                alert("Column name is required.");
                return;
              }

              // Auto-generate key from label if not provided
              const labelToKey = (l) => l.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
              const key = labelToKey(label);
              console.log("Generated column key:", key);
              
              if (!key) {
                console.warn("Column key generated from label is invalid");
                alert("Column name contains only special characters. Please use alphanumeric characters.");
                return;
              }

              console.log("Normalizing column config...");
              const nextColumn = normalizeColumnConfig({ ...colForm, key, label });
              console.log("Normalized column:", nextColumn);

              setColumns((currentColumns) => {
                const next = [...currentColumns];
                if (editingColumnIndex !== null && next[editingColumnIndex]) {
                  console.log("Updating existing column at index:", editingColumnIndex);
                  next[editingColumnIndex] = nextColumn;
                } else {
                  console.log("Adding new column to columns array");
                  next.push(nextColumn);
                }
                console.log("Updated columns array:", next);
                return next;
              });

              console.log("Column saved successfully, closing modal");
              setShowColumnModal(false);
              setColumnToEdit(null);
              setEditingColumnIndex(null);
            } catch (err) {
              console.error("Error saving column:", err);
              alert(`Error saving column: ${err.message}`);
            }
          }}
        />
      )}
    </div>
  );
}
