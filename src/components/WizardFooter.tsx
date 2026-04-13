import { EuiButton, EuiFlexGroup, EuiFlexItem, EuiHorizontalRule, EuiSpacer } from "@elastic/eui";

interface WizardFooterProps {
  activePage: string;
  onNavigate: (page: string) => void;
  /** Ordered wizard step ids (e.g. connection … ship); must include activePage when footer is shown */
  stepIds: readonly string[];
  /** Per-step readiness — must align with activePage when footer is visible */
  canGoNext: boolean;
}

/**
 * Primary “Next” control for the linear wizard (hidden on Ship and non-wizard pages).
 */
export function WizardFooter({ activePage, onNavigate, stepIds, canGoNext }: WizardFooterProps) {
  const idx = stepIds.indexOf(activePage);
  if (idx < 0 || idx >= stepIds.length - 1) return null;
  const nextId = stepIds[idx + 1];

  return (
    <>
      <EuiSpacer size="l" />
      <EuiHorizontalRule margin="none" />
      <EuiSpacer size="m" />
      <EuiFlexGroup justifyContent="flexEnd" alignItems="center">
        <EuiFlexItem grow={false}>
          <EuiButton
            fill
            iconType="arrowRight"
            iconSide="right"
            onClick={() => onNavigate(nextId)}
            isDisabled={!canGoNext}
          >
            Next
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>
    </>
  );
}
