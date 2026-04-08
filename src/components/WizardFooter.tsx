import { EuiButton, EuiFlexGroup, EuiFlexItem, EuiHorizontalRule, EuiSpacer } from "@elastic/eui";

const WIZARD_STEPS = ["connection", "setup", "services", "config", "ship"] as const;

export type WizardStepId = (typeof WIZARD_STEPS)[number];

interface WizardFooterProps {
  activePage: string;
  onNavigate: (page: string) => void;
  /** Per-step readiness — must align with activePage when footer is visible */
  canGoNext: boolean;
}

/**
 * Primary “Next” control for the linear wizard (hidden on Ship and non-wizard pages).
 */
export function WizardFooter({ activePage, onNavigate, canGoNext }: WizardFooterProps) {
  const idx = WIZARD_STEPS.indexOf(activePage as WizardStepId);
  if (idx < 0 || idx >= WIZARD_STEPS.length - 1) return null;
  const nextId = WIZARD_STEPS[idx + 1];

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
