import type { ReactNode, RefObject } from 'react';
import { Search, Heading } from '@digdir/designsystemet-react';
import { MagnifyingGlassIcon, XMarkIcon } from '@navikt/aksel-icons';

/**
 * Visual shell for the KI-søk dialog (Figma nodes 3266:33298 / 808:14176):
 * backdrop, dialog box, close button, title, and the search input with the
 * circular magnifying-glass submit.
 */
export default function DialogShell({
  title,
  query,
  onQueryChange,
  onSubmit,
  onClose,
  inputRef,
  submitting,
  placeholder,
  children,
}: {
  title: string;
  query: string;
  onQueryChange: (v: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
  submitting: boolean;
  placeholder: string;
  children: ReactNode;
}) {
  return (
    <div
      className="search-dialog-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="search-dialog-container">
        <div
          className="search-dialog-content"
          role="dialog"
          aria-modal="true"
          aria-labelledby="search-dialog-title"
        >
          <button type="button" className="search-dialog-close" onClick={onClose} aria-label="Lukk søk">
            <XMarkIcon aria-hidden fontSize="1.375rem" />
          </button>

          <div className="search-dialog-header">
            <Heading level={2} data-size="xs" id="search-dialog-title" className="search-dialog-title">
              {title}
            </Heading>
            <form
              className="search-dialog-form"
              onSubmit={(e) => {
                e.preventDefault();
                onSubmit();
              }}
            >
              <Search className="search-dialog-search">
                <Search.Input
                  ref={inputRef}
                  aria-label="Søk på ki.norge.no"
                  placeholder={placeholder}
                  value={query}
                  onChange={(e) => onQueryChange(e.target.value)}
                />
                {query && <Search.Clear onClick={() => onQueryChange('')} />}
                <button type="submit" className="search-dialog-submit" aria-label="Søk" disabled={submitting}>
                  <MagnifyingGlassIcon aria-hidden fontSize="1.375rem" />
                </button>
              </Search>
            </form>
          </div>

          <div className="search-dialog-scroll">{children}</div>
        </div>
      </div>
    </div>
  );
}
