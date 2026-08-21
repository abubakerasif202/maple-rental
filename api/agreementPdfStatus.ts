type AgreementPdfStatusArtifact = {
  failure_code?: string | null;
  generated_at?: string | null;
  generation_status: string;
};

export const buildAgreementPdfStatusResponse = (
  artifact: AgreementPdfStatusArtifact | null,
) => artifact
  ? {
      artifact_status: artifact.generation_status,
      failure_code: artifact.failure_code || null,
      generated_at: artifact.generated_at || null,
    }
  : { artifact_status: 'pending' };
