import { useEffect, useRef, useState } from 'react';
import { Link } from '@digdir/designsystemet-react';
import { MenuHamburgerIcon, XMarkIcon } from '@navikt/aksel-icons';
import cl from 'clsx/lite';
import Logo from './Logo';

interface NavItem {
  href: string;
  label: string;
}

interface HeaderProps {
  currentPath: string;
  navItems?: NavItem[];
}

const defaultNavItems: NavItem[] = [
  { href: '/veiledning', label: 'Veiledning' },
  { href: '/eksempler', label: 'Eksempler' },
  { href: '/artikler', label: 'Aktuelt' },
  { href: '/sandkasse', label: 'Sandkasse' },
];

/**
 * Detect if any items have wrapped to a new line
 */
const detectWrap = (items: HTMLCollection) => {
  let prevItem: DOMRect | null = null;

  for (let i = 0; i < items.length; i++) {
    const currItem = items[i].getBoundingClientRect();

    if (prevItem && prevItem.bottom < currItem.bottom) {
      return true;
    }

    prevItem = currItem;
  }

  return false;
};

export default function Header({ currentPath: initialPath, navItems = defaultNavItems }: HeaderProps) {
  const [activePath, setActivePath] = useState(initialPath);
  const [isHamburger, setIsHamburger] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(0);
  const menuRef = useRef<HTMLUListElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  // Update active path on Astro client-side navigation
  useEffect(() => {
    const handleNavigation = () => {
      setActivePath(window.location.pathname);
    };
    document.addEventListener('astro:after-swap', handleNavigation);
    return () => document.removeEventListener('astro:after-swap', handleNavigation);
  }, []);

  // Close mobile menu on blur (tab focus leaves)
  const handleBlur = (e: React.FocusEvent) => {
    if (
      mobileMenuRef.current &&
      e.relatedTarget instanceof Node &&
      !mobileMenuRef.current.contains(e.relatedTarget)
    ) {
      mobileMenuRef.current.hidePopover();
    }
  };

  // Wrap detection
  useEffect(() => {
    const handleResize = () => {
      if (isHamburger && viewportWidth > 0) {
        const SAFETY_MARGIN = 50;
        if (window.innerWidth > viewportWidth + SAFETY_MARGIN) {
          setIsHamburger(false);
        }
      } else if (menuRef.current && headerRef.current) {
        const hasWrapped = detectWrap(menuRef.current.children);
        if (hasWrapped) {
          setViewportWidth(window.innerWidth);
          setIsHamburger(true);
        }
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isHamburger, viewportWidth]);

  return (
    <header className={cl('header', isHamburger && 'header--hamburger')} ref={headerRef}>
      <div className="header-container">
        <Link href="/" className="logo-link" aria-label="KI Norge">
          <Logo className="logo-icon" />
        </Link>

        <nav aria-label="Hovednavigasjon">
          {/* Desktop nav — always rendered but visually hidden when hamburger mode */}
          <ul className={cl('nav-list', isHamburger && 'nav-list--hidden')} ref={menuRef}>
            {navItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cl('nav-link', activePath.startsWith(item.href) && 'active')}
                  aria-current={activePath.startsWith(item.href) ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>

          {/* Hamburger toggle — always in DOM, CSS hides on desktop */}
          <button
            className={cl('hamburger-toggle', 'ds-focus', !isHamburger && 'hamburger-toggle--js-hidden')}
            aria-label="Åpne meny"
            popoverTarget="header-mobile-menu"
            popoverTargetAction="show"
          >
            <MenuHamburgerIcon aria-hidden fontSize="1.5rem" />
          </button>
        </nav>
      </div>

      {/* Mobile menu — always in DOM for popover API, hidden by default */}
      <div
        className="mobile-menu"
        id="header-mobile-menu"
        ref={mobileMenuRef}
        popover="auto"
        onBlur={handleBlur}
      >
          <div className="mobile-menu-header">
            <Link href="/" className="logo-link" aria-label="KI Norge - Hjem">
              <Logo className="logo-icon" />
            </Link>
            <button
              className="hamburger-toggle ds-focus"
              aria-label="Lukk meny"
              popoverTarget="header-mobile-menu"
              popoverTargetAction="hide"
            >
              <XMarkIcon aria-hidden fontSize="1.5rem" />
            </button>
          </div>
          <ul className="mobile-menu-list">
            {navItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cl('nav-link', activePath.startsWith(item.href) && 'active')}
                  aria-current={activePath.startsWith(item.href) ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
      </div>
    </header>
  );
}
