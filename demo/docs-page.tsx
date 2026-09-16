import { useEffect, useRef, useState } from 'react';
import {
  Cell,
  Column,
  Divider,
  Link,
  LinkButton,
  Row,
  SearchField,
  SideNav,
  SideNavItem,
  SideNavItemContent,
  SideNavItemLink,
  TableBody,
  TableHeader,
  TableView,
  Text,
} from '@react-spectrum/s2';
import ChevronLeft from '@react-spectrum/s2/icons/ChevronLeft';
import ChevronRight from '@react-spectrum/s2/icons/ChevronRight';
import { Choice, CopyButton } from './controls';
import { documentation } from './docs-content';
import terrainGuide from '../docs/terrain.md?url';
import * as layout from './layout';

export function DocsPage({ slug = 'getting-started', anchor }: { slug?: string; anchor?: string }) {
  const [query, setQuery] = useState('');
  const scroll = useRef<HTMLDivElement>(null);
  const article = useRef<HTMLElement>(null);
  const page = documentation.find((page) => page.id === slug);
  const index = page ? documentation.indexOf(page) : -1;
  const visible = documentation.filter((page) =>
    `${page.title} ${page.description} ${page.sections.map((section) => `${section.title} ${section.paragraphs.join(' ')}`).join(' ')}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  useEffect(() => {
    if (anchor) document.getElementById(`docs-${anchor}`)?.scrollIntoView({ block: 'start' });
    else {
      scroll.current?.scrollTo(0, 0);
      if (innerWidth < 1280) window.scrollTo(0, 0);
    }
    article.current?.focus({ preventScroll: true });
  }, [slug, anchor]);

  return (
    <div id="docs-page" ref={scroll} className={layout.pageScroll}>
      <div className={layout.docsLayout}>
        <aside className={layout.docsSidebar} aria-label="Documentation navigation">
          <h2 className={layout.sectionHeading}>Documentation</h2>
          <SearchField
            id="docs-search"
            aria-label="Search documentation"
            placeholder="Find a topic…"
            value={query}
            onChange={setQuery}
            styles={layout.fullWidth}
          />
          <div className={layout.docsDesktopNav}>
            <SideNav aria-label="Documentation topics" selectedRoute={`#docs/${slug}`}>
              {visible.map((topic) => (
                <SideNavItem
                  id={topic.id}
                  key={topic.id}
                  textValue={topic.title}
                  href={`#docs/${topic.id}`}
                >
                  <SideNavItemContent>
                    <SideNavItemLink>{topic.title}</SideNavItemLink>
                  </SideNavItemContent>
                </SideNavItem>
              ))}
            </SideNav>
          </div>
          <div className={layout.docsMobileNav}>
            <Choice
              id="docs-topic"
              label="Topic"
              value={page?.id ?? ''}
              options={visible.map((topic) => [topic.id, topic.title])}
              onChange={(id) => {
                location.hash = `docs/${id}`;
              }}
            />
          </div>
          {!visible.length && (
            <p role="status" className={layout.quiet}>
              No matching topics.
            </p>
          )}
          <Link isStandalone variant="secondary" href="#components">
            Component reference
          </Link>
        </aside>
        <article id="docs-article" ref={article} tabIndex={-1} className={layout.docsArticle}>
          {page ? (
            <>
              <header className={layout.stack}>
                <Text styles={layout.eyebrow}>{page.group}</Text>
                <h1 className={layout.pageTitle}>{page.title}</h1>
                <p className={layout.lead}>{page.description}</p>
              </header>
              {page.sections.map((section) => (
                <section id={`docs-${section.id}`} key={section.id} className={layout.docsSection}>
                  <h2 className={layout.articleHeading}>{section.title}</h2>
                  {section.paragraphs.map((text) => (
                    <p key={text} className={layout.prose}>
                      {text}
                    </p>
                  ))}
                  {section.code?.map((code) => (
                    <div key={code.label} className={layout.codeExample}>
                      <div className={layout.codeToolbar}>
                        <Text styles={layout.quiet}>{code.label}</Text>
                        <CopyButton
                          text={code.value}
                          label="Copy"
                          ariaLabel={`Copy ${code.label}`}
                        />
                      </div>
                      <pre className={layout.docCode}>
                        <code>{code.value}</code>
                      </pre>
                    </div>
                  ))}
                  {section.table && (
                    <TableView
                      aria-label={section.title}
                      overflowMode="wrap"
                      styles={layout.fullWidth}
                    >
                      <TableHeader>
                        {section.table.columns.map((title, i) => (
                          <Column key={title} id={title} isRowHeader={i === 0}>
                            {title}
                          </Column>
                        ))}
                      </TableHeader>
                      <TableBody>
                        {section.table.rows.map((row, i) => (
                          <Row key={i} id={i}>
                            {row.map((value, j) => (
                              <Cell key={j}>{value}</Cell>
                            ))}
                          </Row>
                        ))}
                      </TableBody>
                    </TableView>
                  )}
                  {section.links && (
                    <div className={layout.actions}>
                      {section.links.map((link) => (
                        <LinkButton
                          key={link.href}
                          href={link.href}
                          variant="secondary"
                          fillStyle="outline"
                        >
                          <Text>{link.label}</Text>
                          <ChevronRight />
                        </LinkButton>
                      ))}
                    </div>
                  )}
                </section>
              ))}
              {page.id === 'terrain' && (
                <Link isStandalone href={terrainGuide} download="hudini-terrain.md">
                  Download the full terrain integration guide
                </Link>
              )}
              <Divider />
              <nav aria-label="Adjacent documentation" className={layout.articlePagination}>
                {index > 0 && (
                  <LinkButton
                    href={`#docs/${documentation[index - 1]!.id}`}
                    variant="secondary"
                    fillStyle="outline"
                  >
                    <ChevronLeft />
                    <Text>{documentation[index - 1]!.title}</Text>
                  </LinkButton>
                )}
                <div className={layout.grow} />
                {index < documentation.length - 1 && (
                  <LinkButton
                    href={`#docs/${documentation[index + 1]!.id}`}
                    variant="secondary"
                    fillStyle="outline"
                  >
                    <Text>{documentation[index + 1]!.title}</Text>
                    <ChevronRight />
                  </LinkButton>
                )}
              </nav>
            </>
          ) : (
            <div className={layout.stack}>
              <h1 className={layout.pageTitle}>Page not found</h1>
              <p className={layout.prose}>Choose a documentation topic to continue.</p>
              <LinkButton href="#docs" variant="primary" styles={layout.fitContent}>
                Getting started
              </LinkButton>
            </div>
          )}
        </article>
        {page && (
          <nav aria-label="On this page" className={layout.docsContents}>
            <h2 className={layout.sectionHeading}>On this page</h2>
            {page.sections.map((section) => (
              <Link
                key={section.id}
                isStandalone
                variant="secondary"
                href={`#docs/${page.id}/${section.id}`}
              >
                {section.title}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}
