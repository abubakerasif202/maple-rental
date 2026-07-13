import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { motion } from 'motion/react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export const getNextDialogFocusIndex = (
  currentIndex: number,
  itemCount: number,
  moveBackward: boolean,
) => {
  if (itemCount <= 0) {
    return -1;
  }

  if (moveBackward) {
    return currentIndex <= 0 ? itemCount - 1 : currentIndex - 1;
  }

  return currentIndex < 0 || currentIndex >= itemCount - 1 ? 0 : currentIndex + 1;
};

interface AccessibleDialogProps {
  animationScale?: number;
  ariaLabelledBy: string;
  children: ReactNode;
  className: string;
  onClose: () => void;
}

export default function AccessibleDialog({
  animationScale = 0.95,
  ariaLabelledBy,
  children,
  className,
  onClose,
}: AccessibleDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const dialog = dialogRef.current;
    const firstFocusable = dialog?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);

    (firstFocusable ?? dialog)?.focus();

    return () => {
      previouslyFocused?.focus();
    };
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeRef.current();
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const dialog = dialogRef.current;
    const focusableElements = dialog
      ? Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      : [];

    event.preventDefault();

    if (focusableElements.length === 0) {
      dialog?.focus();
      return;
    }

    const currentIndex = focusableElements.indexOf(document.activeElement as HTMLElement);
    const nextIndex = getNextDialogFocusIndex(
      currentIndex,
      focusableElements.length,
      event.shiftKey,
    );
    focusableElements[nextIndex]?.focus();
  };

  return (
    <motion.div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={ariaLabelledBy}
      tabIndex={-1}
      initial={{ opacity: 0, scale: animationScale }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: animationScale }}
      onKeyDown={handleKeyDown}
      className={className}
    >
      {children}
    </motion.div>
  );
}
