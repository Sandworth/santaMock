# Plan: Share signer dialog logic

Move the reusable dialog state, validation, fragment lifecycle, and `/Deposits` creation into `BaseController`; keep only request-specific text, payload construction, and post-success behavior in each child controller.

**Steps**
1. Add UI5 dependencies for `JSONModel`, `Fragment`, `MessageBox`, and `MessageToast` to `BaseController`.
2. Add `_openSignerSelectionDialog(oOptions)` to `BaseController`.
   - Lazily initialize the `signers` model.
   - Reset the five mock signers on every open, so old emails and selections never persist.
   - Load/cache the `SignerSelectionDialog` fragment.
   - Store an explicit pending configuration rather than controller-specific fields such as `_pendingDepositPayload` and `_pendingCustomDepositPayload`.
3. Define `oOptions` as an object with `confirmationText`, `dialogTitle`, `confirmButtonText`, `payload`, `successMessageKey`, `errorMessageKey`, and `onSuccess`.
   - `onSuccess(aSelectedSigners, oPayload)` is the only controller-specific callback.
   - The selected signers remain available to the callback for a future contract API, although they are not sent to `/Deposits` today.
4. Move `onSignerSelectionChange`, `onConfirmDepositWithSigners`, and `onCancelSignerSelection` into `BaseController`.
   - `onSignerSelectionChange` retains the existing behavior that clears an email when a signer is deselected.
   - `onConfirmDepositWithSigners` enforces one or more signers and a non-empty email for every selected signer, creates the supplied payload at `/Deposits`, executes `onSuccess`, and shows the configured success/error message.
5. Simplify `DepositDetail.controller.js`.
   - Keep `onRequestDeposit()` responsible for its existing message and standard-tenor payload.
   - Replace its local signer methods with one base-method call configured with `requestConfirmTitle`, `signerConfirmBtn`, `requestSuccessMsg`, `requestErrorMsg`, and an `onSuccess` callback that invokes `handleClose()`.
6. Simplify `DepositsList.controller.js`.
   - Keep `onSubmitCustomRequest()` responsible for preserving its existing `customReqConfirmMsg` construction and custom-tenor payload.
   - Configure the base method with `customReqConfirmTitle`, `customReqSubmitBtn`, `customReqSuccessMsg`, `customReqErrorMsg`, and an `onSuccess` callback that invokes `onCancelCustomRequest()`.
7. Add `_destroySignerSelectionDialog()` in `BaseController` and call it from each controller’s `onExit()` to clean up the cached dialog predictably.

**Important design decisions**
- Use an options object, not several positional arguments, to keep the reusable API readable and extensible.
- Keep the public handler names unchanged because the signer dialog fragment references them.
- The existing fragment prefix based on `this.getView().getId()` is already distinct between the list and detail views; no random IDs are needed.
- Signers remain UI-only until an OData contract/signer relationship exists.

**Verification**
1. Confirm both flows reset selected signers and email fields when reopened.
2. Verify both flows block submission with no signer or a missing selected-signer email.
3. Verify standard requests still navigate back after creation.
4. Verify custom requests still close and reset the custom-request dialog after creation.
5. Run diagnostics and lint for the three modified controllers and the fragment.
