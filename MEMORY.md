- [Remove account type from user accounts modal](remove-account-type-from-user-accounts-modal.md) — Removed account type selection from user accounts edit modal, leaving only borrowing system access controls. Added logic to auto-grant all permissions for superadmin/admin accounts.

- [Fix UserAccounts update error](fix-useraccounts-update-error.md) — Removed the attempted update of the non-existent `updated_at` column in the handleSaveAccess function, fixing the PGRST204 error.

- [Add merge logic to PublicBorrow](add-merge-logic-to-publicborrow.md) — Added mergeWithLastBorrow state, useEffect to fetch latest active borrow, and merge logic in confirmBorrow function. Added Checkbox import for future merge UI.

- [Hide status dropdown if no permission](hide-status-dropdown-if-no-permission.md) — Modified Borrowing.jsx to hide the status dropdown for users without viewAccess or approveAccess permissions.