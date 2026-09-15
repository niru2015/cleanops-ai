"use client";

import { type RefObject, useEffect, useRef, useState } from "react";
import { navigationItems } from "@/config/navigation";
import { BrandMark, CloseIcon, EmptyDocumentIcon, MenuIcon, NavigationGlyph } from "@/components/icons";

function Brand() {
  return (
    <div className="brand" aria-label="CleanOps">
      <BrandMark className="brandMark" />
      <span>CleanOps</span>
    </div>
  );
}

function Navigation() {
  return (
    <nav aria-label="Primary navigation" className="navigation">
      <ul>
        {navigationItems.map((item) => (
          <li key={item.label}>
            {item.current ? (
              <a className="navItem navItemActive" href={item.href} aria-current="page">
                <NavigationGlyph className="navIcon" name={item.icon} />
                <span>{item.label}</span>
              </a>
            ) : (
              <span className="navItem navItemPlanned" role="link" aria-disabled="true">
                <NavigationGlyph className="navIcon" name={item.icon} />
                <span className="navCopy">
                  <span>{item.label}</span>
                  <span className="navStatus">{item.status}</span>
                </span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

function NavigationPanel({
  closeButtonRef,
  onClose,
}: {
  closeButtonRef?: RefObject<HTMLButtonElement | null>;
  onClose?: () => void;
}) {
  return (
    <div className="navigationPanel">
      <div className="brandRow">
        <Brand />
        {onClose ? (
          <button
            ref={closeButtonRef}
            className="iconButton drawerClose"
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
          >
            <CloseIcon />
          </button>
        ) : null}
      </div>
      <Navigation />
      <p className="shellRevision">CLEAN-001 <span aria-hidden="true">•</span> Application shell</p>
    </div>
  );
}

export function AppShell() {
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const closeMobileNavigation = () => {
    setMobileNavigationOpen(false);
    requestAnimationFrame(() => menuButtonRef.current?.focus());
  };

  useEffect(() => {
    if (!mobileNavigationOpen) return;

    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileNavigationOpen(false);
        requestAnimationFrame(() => menuButtonRef.current?.focus());
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileNavigationOpen]);

  return (
    <div className="appShell">
      <aside className="desktopSidebar">
        <NavigationPanel />
      </aside>

      <div className="workspaceColumn">
        <header className="mobileHeader">
          <Brand />
          <button
            ref={menuButtonRef}
            className="iconButton menuButton"
            type="button"
            aria-label="Open navigation"
            aria-expanded={mobileNavigationOpen}
            aria-controls="mobile-navigation"
            onClick={() => setMobileNavigationOpen(true)}
          >
            <MenuIcon />
          </button>
        </header>

        <div className="prototypeBanner" role="status">Prototype <span aria-hidden="true">•</span> synthetic data</div>

        <main className="workspace" id="main-content">
          <h1>Operations workspace</h1>
          <section className="emptyState" aria-labelledby="empty-state-title">
            <EmptyDocumentIcon className="emptyIllustration" />
            <h2 id="empty-state-title" className="visuallyHidden">Application shell ready</h2>
            <p>The CleanOps foundation is ready. Operational data will appear after CLEAN-002 adds the local Supabase domain model.</p>
          </section>
          <p className="mobileRevision">CLEAN-001 <span aria-hidden="true">•</span> Application shell</p>
        </main>
      </div>

      {mobileNavigationOpen ? (
        <div className="mobileNavigationLayer" id="mobile-navigation">
          <div className="drawerBackdrop" role="presentation" onClick={closeMobileNavigation} />
          <aside className="mobileDrawer" aria-label="Navigation drawer">
            <NavigationPanel closeButtonRef={closeButtonRef} onClose={closeMobileNavigation} />
          </aside>
        </div>
      ) : null}
    </div>
  );
}
