import { useState, useCallback, type Dispatch, type SetStateAction } from "react";
import {
  validateElasticUrl,
  validateApiKey,
  validateIndexPrefix,
  testConnection,
  discoverKibanaSpaces,
  DEFAULT_KIBANA_SPACE,
  type KibanaSpace,
} from "../utils/validation";

export type ConnectionStatus = "idle" | "testing" | "ok" | "fail";

export function useConnectionValidation(
  elasticUrl: string,
  apiKey: string,
  indexPrefix: string,
  kibanaUrl: string
): {
  validationErrors: { elasticUrl: string; apiKey: string; indexPrefix: string };
  setValidationErrors: Dispatch<
    SetStateAction<{ elasticUrl: string; apiKey: string; indexPrefix: string }>
  >;
  connectionStatus: ConnectionStatus;
  connectionMsg: string;
  isServerless: boolean;
  /** Kibana spaces discovered during the last successful test connection. */
  spaces: KibanaSpace[];
  spacesMsg: string;
  runConnectionValidation: () => boolean;
  handleTestConnection: () => Promise<void>;
} {
  const [validationErrors, setValidationErrors] = useState({
    elasticUrl: "",
    apiKey: "",
    indexPrefix: "",
  });
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");
  const [connectionMsg, setConnectionMsg] = useState("");
  const [isServerless, setIsServerless] = useState(false);
  const [spaces, setSpaces] = useState<KibanaSpace[]>([DEFAULT_KIBANA_SPACE]);
  const [spacesMsg, setSpacesMsg] = useState("");

  const runConnectionValidation = useCallback(() => {
    const urlResult = validateElasticUrl(elasticUrl);
    const keyResult = validateApiKey(apiKey);
    const prefixResult = validateIndexPrefix(indexPrefix);
    setValidationErrors({
      elasticUrl: urlResult.valid ? "" : (urlResult.message ?? ""),
      apiKey: keyResult.valid ? "" : (keyResult.message ?? ""),
      indexPrefix: prefixResult.valid ? "" : (prefixResult.message ?? ""),
    });
    return urlResult.valid && keyResult.valid && prefixResult.valid;
  }, [elasticUrl, apiKey, indexPrefix]);

  const handleTestConnection = useCallback(async () => {
    if (!validateElasticUrl(elasticUrl).valid || !validateApiKey(apiKey).valid) {
      runConnectionValidation();
      return;
    }
    setConnectionStatus("testing");
    setConnectionMsg("");
    const result = await testConnection(elasticUrl, apiKey);
    if (result.valid) {
      setConnectionStatus("ok");
      setIsServerless(result.isServerless === true);
      const ver = result.version ? ` (Elasticsearch ${result.version})` : "";
      const flavor = result.isServerless ? " — Serverless" : "";
      setConnectionMsg(`Connected successfully${ver}${flavor}`);
      // Discover Kibana spaces for the multitenancy target selector. Best-effort:
      // failures fall back to the Default space without failing the connection.
      const discovered = await discoverKibanaSpaces(kibanaUrl, apiKey);
      setSpaces(discovered.spaces);
      setSpacesMsg(
        discovered.ok
          ? discovered.spaces.length > 1
            ? `Discovered ${discovered.spaces.length} Kibana spaces.`
            : ""
          : (discovered.message ?? "")
      );
    } else {
      setConnectionStatus("fail");
      setIsServerless(false);
      setConnectionMsg(result.message ?? "Connection failed");
      setSpaces([DEFAULT_KIBANA_SPACE]);
      setSpacesMsg("");
    }
  }, [elasticUrl, apiKey, kibanaUrl, runConnectionValidation]);

  return {
    validationErrors,
    setValidationErrors,
    connectionStatus,
    connectionMsg,
    isServerless,
    spaces,
    spacesMsg,
    runConnectionValidation,
    handleTestConnection,
  };
}
