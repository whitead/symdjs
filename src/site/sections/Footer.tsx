// Colophon: citation (BibTeX with copy), credits and links.

import { useState } from "react";
import { Button } from "../components/Button";
import { CheckIcon, CopyIcon } from "../components/Icons";
import "../styles/sections/footer.css";

const BIBTEX = `@article{cox2022symmetric,
  title   = {Symmetric Molecular Dynamics},
  author  = {Cox, Sam and White, Andrew D.},
  journal = {Journal of Chemical Theory and Computation},
  volume  = {18},
  number  = {7},
  pages   = {4077--4084},
  year    = {2022},
  doi     = {10.1021/acs.jctc.2c00401}
}`;

export function Footer() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(BIBTEX);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable: the text stays selectable */
    }
  };

  return (
    <footer className="footer">
      <div className="footer__inner">
        <div className="footer__ornament" aria-hidden="true">
          <span />
          <svg viewBox="0 0 40 40" width="28" height="28">
            {Array.from({ length: 6 }, (_, i) => {
              const a = (i * Math.PI) / 3;
              return <circle key={i} cx={20 + 11 * Math.cos(a)} cy={20 + 11 * Math.sin(a)} r="4.2" />;
            })}
            <circle cx="20" cy="20" r="4.2" />
          </svg>
          <span />
        </div>

        <div className="footer__grid">
          <section className="footer__cite" aria-labelledby="cite-title">
            <h2 id="cite-title" className="footer__heading">
              Cite
            </h2>
            <p className="footer__ref">
              S. Cox and A. D. White, &ldquo;Symmetric Molecular Dynamics,&rdquo; <i>J. Chem. Theory Comput.</i>{" "}
              <b>18</b>, 4077&ndash;4084 (2022).{" "}
              <a href="https://doi.org/10.1021/acs.jctc.2c00401">doi:10.1021/acs.jctc.2c00401</a>
            </p>
            <div className="footer__bib">
              <pre tabIndex={0} aria-label="BibTeX citation">
                <code>{BIBTEX}</code>
              </pre>
              <Button
                size="s"
                variant="secondary"
                icon={copied ? <CheckIcon /> : <CopyIcon />}
                onClick={copy}
                className="footer__copy"
                aria-live="polite"
              >
                {copied ? "Copied" : "Copy BibTeX"}
              </Button>
            </div>
          </section>

          <section aria-labelledby="credits-title">
            <h2 id="credits-title" className="footer__heading">
              Credits
            </h2>
            <ul className="footer__list">
              <li>
                Method: Sam Cox &amp; Andrew D. White (2022).
              </li>
              <li>
                Reference implementation: <a href="https://github.com/whitead/symd">symd</a> (C &amp; Python, MIT).
              </li>
              <li>Group tables and Wyckoff positions from symd, derived from the Bilbao Crystallographic Server.</li>
              <li>Palette and paper colour from the paper&rsquo;s figures.</li>
            </ul>
          </section>

          <section aria-labelledby="links-title">
            <h2 id="links-title" className="footer__heading">
              Links
            </h2>
            <ul className="footer__list footer__links">
              <li>
                <a href="https://doi.org/10.1021/acs.jctc.2c00401">The paper (JCTC, 2022)</a>
              </li>
              <li>
                <a href="https://github.com/whitead/symd">whitead/symd on GitHub</a>
              </li>
              <li>
                <a href="#atlas">Table of plates</a>
              </li>
              <li>
                <a href="#top">Back to the frontispiece</a>
              </li>
            </ul>
          </section>
        </div>

        <p className="footer__colophon">
          Set in Fraunces, IBM Plex Sans and IBM Plex Mono. Simulated with WebGPU in your browser; nothing is sent to a
          server.
        </p>
      </div>
    </footer>
  );
}
