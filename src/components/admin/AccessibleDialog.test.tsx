import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AccessibleDialog, { getNextDialogFocusIndex } from './AccessibleDialog';

describe('AccessibleDialog', () => {
  it('renders named modal dialog semantics', () => {
    const markup = renderToStaticMarkup(
      <AccessibleDialog
        ariaLabelledBy="dialog-title"
        className="dialog"
        onClose={() => undefined}
      >
        <h2 id="dialog-title">Review application</h2>
      </AccessibleDialog>,
    );

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('aria-labelledby="dialog-title"');
  });

  it('wraps keyboard focus in both directions', () => {
    expect(getNextDialogFocusIndex(2, 3, false)).toBe(0);
    expect(getNextDialogFocusIndex(0, 3, true)).toBe(2);
    expect(getNextDialogFocusIndex(-1, 3, false)).toBe(0);
  });
});
