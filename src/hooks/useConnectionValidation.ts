import { useState, useCallback, type Dispatch, type SetStateAction } from "react";
import {
  validateElasticUrl,
  validateApiKey,
  validateIndexPrefix,
  testConnection,
} from "../utils/validation";

export type ConnectionStatus = "idle" | "testing" | "ok" | "fail";

export function useConnectionValidation(
  elasticUrl: string,
  apiKey: string,
  indexPrefix: string
): {
  validationErrors: { elasticUrl: string; apiKey: string; indexPrefix: string };
  setValidationErrors: Dispatch<
    SetStateAction<{ elasticUrl: string; apiKey: string; indexPrefix: string }>
  >;
  connectionStatus: ConnectionStatus;
  connectionMsg: string;
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
      const ver = result.version ? ` (Elasticsearch ${result.version})` : "";
      setConnectionMsg(`Connected successfully${ver}`);
    } else {
      setConnectionStatus("fail");
      setConnectionMsg(result.message ?? "Connection failed");
    }
  }, [elasticUrl, apiKey, runConnectionValidation]);

  return {
    validationErrors,
    setValidationErrors,
    connectionStatus,
    connectionMsg,
    runConnectionValidation,
    handleTestConnection,
  };
}
