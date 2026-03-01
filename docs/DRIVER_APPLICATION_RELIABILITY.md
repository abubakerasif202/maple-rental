# Driver Application Reliability Upgrade

## Purpose
To improve the user experience and reliability of the driver application process. This enhancement ensures that data is accurately validated before it reaches the server and that users receive clear, real-time feedback during the application flow.

## Understanding Summary
- **What is being built:** A set of validation and UI improvements for `Apply.tsx`.
- **Why it exists:** To reduce submission errors, provide better feedback for file uploads, and ensure the driver data is formatted correctly.
- **Who it is for:** New drivers applying to the platform.
- **Key constraints:**
  - **Visual Feedback:** Added thumbnails for license and Uber screenshots.
  - **Strict Validation:** Stricter rules for phone, email, and dates.
  - **Error Handling:** Replacing `alert()` with an inline error message and loading states.
- **Explicit non-goals:** Redesigning the form layout, changing the API response format, or adding new fields.

## Assumptions
- The application will continue using `react-hook-form` and `zod`.
- The user's browser supports `FileReader` for generating local image previews.
- Submission errors will be displayed in an animated, high-visibility alert box.

## Decision Log
| Decision | Alternatives Considered | Reason for Choice |
| :--- | :--- | :--- |
| **Inline File Previews** | No preview, full-screen overlay | Simplest and most helpful way for a user to confirm they uploaded the correct file. |
| **Strict Date Validation** | Basic string check, Server-side check | Prevents users from submitting expired licenses or back-dated rentals. |
| **Animated Error Alert** | `alert()`, toast notification | More integrated and hard to miss for a long form like the driver application. |

## Final Design

### 1. Enhanced `applySchema` (Zod)
- **Phone:** `z.string().regex(/^(?:\+61|0)4\d{8}$/, 'Valid Australian mobile required')`
- **Email:** `z.string().email().trim().toLowerCase()`
- **License Expiry:** `.refine(date => new Date(date) > new Date(), 'License must not be expired')`
- **Start Date:** `.refine(date => new Date(date) >= new Date(), 'Start date must be today or in the future')`

### 2. File Upload Previews
- **Logic:** Use `FileReader.readAsDataURL()` to generate a base64 string.
- **UI:** A small, square thumbnail (approx 150px) with a "Remove" button will appear above the "Upload" zone once a file is selected.
- **Feedback:** If a file is > 5MB, a validation error is triggered immediately.

### 3. Submission Feedback (UI)
- **Error State:** A `submissionError` string state in `Apply.tsx`.
- **Error UI:** A red, bordered alert box at the top of the form containing the server's error message.
- **Loading State:** The "Submit" button will change to "Processing Application..." and show a loading icon during the API call.

## Implementation Plan
1. Update `Apply.tsx` to include the enhanced `applySchema`.
2. Add `licensePreview` and `uberPreview` states to `Apply.tsx`.
3. Implement the `handleFileUpload` logic to set both the form value and the preview state.
4. Refactor the `onSubmit` function to handle `submissionError` and loading states.
5. Add the "Submission Error" alert component to the top of the form.
6. Add the "File Preview" thumbnails to the file upload section.
