import { useEffect, useState } from "react";
import { EuiEmptyPrompt, EuiLoadingSpinner } from "@elastic/eui";
import type { CloudSetupBundle } from "../setup/types";
import { SetupPage, type SetupPageProps } from "./SetupPage";

type SetupPageLoaderProps = Omit<SetupPageProps, "setupBundle"> & {
  /** Lazily resolves the heavy install-asset bundle (kept out of the vendor-config chunk). */
  loadSetupBundle: () => Promise<CloudSetupBundle>;
};

/**
 * Thin async wrapper around {@link SetupPage}. The heavy Setup asset bundle
 * (ingest pipelines, dashboards, ML jobs, alert + detection rules) is no longer
 * bundled into the eager vendor-config chunk — it loads on demand here, the
 * first time the user opens the Setup page. SetupPage itself still receives a
 * fully-resolved, non-null bundle so its internals stay unchanged.
 */
export function SetupPageLoader({ loadSetupBundle, ...rest }: SetupPageLoaderProps) {
  const [bundle, setBundle] = useState<CloudSetupBundle | null>(null);

  useEffect(() => {
    let active = true;
    setBundle(null);
    void loadSetupBundle().then((b) => {
      if (active) setBundle(b);
    });
    return () => {
      active = false;
    };
  }, [loadSetupBundle]);

  if (!bundle) {
    return (
      <EuiEmptyPrompt
        icon={<EuiLoadingSpinner size="xl" />}
        title={<h2>Loading setup assets…</h2>}
        body={<p>Fetching dashboards, ML jobs, ingest pipelines and rules.</p>}
      />
    );
  }

  return <SetupPage setupBundle={bundle} {...rest} />;
}
