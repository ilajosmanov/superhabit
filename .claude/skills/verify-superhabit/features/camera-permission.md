# Camera permission

Before the squat screen uses the camera, it explains why and asks for access. With access granted, it goes straight to the live session.

## Sub-features

- `perm-rationale` shows `Camera access is needed to count reps.` and an `Allow camera` button when access is not granted.
- `perm-grant` shows the system dialog after `Allow camera`, and granting opens the live session.
- `perm-deny` keeps the rationale screen when the user denies.
- `perm-granted-skip` skips the rationale when access was already granted.

## How to get to it (user POV)

- Open the squat screen from home (`Squat test →`) or with `superhabit://squat` while camera access is not granted.

## Driving it with sv

Preconditions:

- Baseline from the index. `$SV perm revoke` ran. It records the original state, and `cleanup` restores it. Revoking kills the app process, so run `$SV reload` after it.

- **Rationale.** Open the squat screen. Run `$SV tap "Squat test →"` and `$SV wait "Allow camera"`. The tree has `Camera access is needed to count reps.` and `Allow camera`. Run `$SV shot perm/rationale`.
- **System dialog.** Tap the button. Run `$SV tap "Allow camera"` and `$SV ui > "$($SV evidence)/perm/dialog.xml"`. The tree belongs to `com.android.permissioncontroller` and has the allow choices. Run `$SV shot perm/dialog`.
- **Deny.** Choose `Don't allow`. Run `$SV tap "Don't allow"` and `$SV wait "Allow camera"`. The rationale is still shown.
- **Grant.** Tap `Allow camera` again and choose `While using the app`. Run `$SV tap "Allow camera"` and `$SV tap "While using the app"` (one tap only, see Gotchas). Then run `$SV wait "Reset" 20` and `$SV shot perm/granted`. The live session panel is shown.
- **Already granted.** Run `$SV reload`, `$SV tap "Squat test →"` and `$SV wait "Reset" 20`. No rationale appears in between.

## Gotchas

- After one or two denials, Android stops showing the dialog and `Allow camera` does nothing. This is OS behavior. Reset it with `$SV perm revoke` followed by `$SV reload`, or note it as observed. Don't report it as an app bug without checking the code.
- The permission dialog's labels come from Samsung's One UI and the OS language (`While using the app`, `Only this time`, `Don't allow`). Read `perm/dialog.xml` for the exact strings before tapping.
- `pm revoke` kills the app. Any session you had open is gone.
