import crypto from 'node:crypto';
import PDFDocument from 'pdfkit';
import { db } from './db/index.js';

export const AGREEMENT_PDF_BUCKET = 'lease-agreements';
export const AGREEMENT_PDF_GENERATOR_VERSION = 'maple-pdfkit-v1';
const PDF_GENERATION_STALE_MS = 5 * 60 * 1000;

export class AgreementPdfProcessingError extends Error {
  artifact: Record<string, any>;
  constructor(artifact: Record<string, any>) {
    super('ARTIFACT_PROCESSING');
    this.artifact = artifact;
  }
}

export const renderSavedAgreementPdf = (content: string): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const document = new PDFDocument({
      size: 'A4', margin: 54, bufferPages: true,
      info: { CreationDate: new Date('2000-01-01T00:00:00.000Z'), Creator: AGREEMENT_PDF_GENERATOR_VERSION },
    });
    const chunks: Buffer[] = [];
    document.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    document.on('error', reject);
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.font('Helvetica-Bold').fontSize(15).text('Maple Rentals Lease Agreement', { align: 'center' });
    document.moveDown();
    document.font('Helvetica').fontSize(10).text(content || '', { align: 'left', lineGap: 3 });
    const range = document.bufferedPageRange();
    for (let index = range.start; index < range.start + range.count; index += 1) {
      document.switchToPage(index);
      document.fontSize(8).fillColor('#555555').text(
        `Maple Rentals | Page ${index + 1} of ${range.count}`,
        54,
        document.page.height - 38,
        { align: 'center', width: document.page.width - 108 },
      );
    }
    document.end();
  });

export const generateAgreementPdfArtifact = async (agreementId: number) => {
  const agreementResult = await db.from('lease_agreements')
    .select('id, content, agreement_template_version')
    .eq('id', agreementId)
    .single();
  if (agreementResult.error || !agreementResult.data) throw new Error('AGREEMENT_NOT_FOUND');

  const existingResult = await db.from('lease_agreement_pdf_artifacts')
    .select('*').eq('source_agreement_id', agreementId).maybeSingle();
  if (existingResult.error) throw new Error('ARTIFACT_LOOKUP_FAILED');
  if (existingResult.data?.generation_status === 'ready') return existingResult.data;

  const insertPayload = {
    failure_code: null,
    generation_status: 'pending',
    generator_version: AGREEMENT_PDF_GENERATOR_VERSION,
    source_agreement_id: agreementId,
    template_version: agreementResult.data.agreement_template_version || null,
    updated_at: new Date().toISOString(),
  };
  let artifact = existingResult.data;
  if (!artifact) {
    const inserted = await db.from('lease_agreement_pdf_artifacts').insert([insertPayload]).select('*').single();
    if (inserted.error && String(inserted.error.code) !== '23505') throw new Error('ARTIFACT_CLAIM_FAILED');
    if (inserted.data) artifact = inserted.data;
    if (!artifact) {
      const raced = await db.from('lease_agreement_pdf_artifacts').select('*').eq('source_agreement_id', agreementId).single();
      if (raced.error || !raced.data) throw new Error('ARTIFACT_CLAIM_FAILED');
      artifact = raced.data;
    }
  }
  if (artifact.generation_status === 'ready') return artifact;
  const claimResult = await db.rpc('claim_lease_agreement_pdf_artifact', {
    p_artifact_id: artifact.id,
    p_stale_before: new Date(Date.now() - PDF_GENERATION_STALE_MS).toISOString(),
  });
  if (claimResult.error) throw new Error('ARTIFACT_CLAIM_FAILED');
  const claim = Array.isArray(claimResult.data) ? claimResult.data[0] : claimResult.data;
  if (!claim) {
    const current = await db.from('lease_agreement_pdf_artifacts').select('*').eq('id', artifact.id).single();
    if (current.error || !current.data) throw new Error('ARTIFACT_CLAIM_FAILED');
    if (current.data.generation_status === 'ready') return current.data;
    throw new AgreementPdfProcessingError(current.data);
  }

  try {
    const bytes = await renderSavedAgreementPdf(String(agreementResult.data.content || ''));
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    const storagePath = `agreements/${agreementId}/${sha256}.pdf`;
    const upload = await db.storage.from(AGREEMENT_PDF_BUCKET).upload(storagePath, bytes, {
      contentType: 'application/pdf', cacheControl: '31536000', upsert: false,
    });
    if (upload.error && !String(upload.error.message).toLowerCase().includes('already exists')) throw new Error('STORAGE_UPLOAD_FAILED');
    const downloaded = await db.storage.from(AGREEMENT_PDF_BUCKET).download(storagePath);
    if (downloaded.error || !downloaded.data) throw new Error('STORAGE_VERIFY_FAILED');
    const uploadedBytes = Buffer.from(await downloaded.data.arrayBuffer());
    const uploadedHash = crypto.createHash('sha256').update(uploadedBytes).digest('hex');
    if (uploadedHash !== sha256 || uploadedBytes.length !== bytes.length) throw new Error('STORAGE_VERIFY_FAILED');
    const completed = await db.from('lease_agreement_pdf_artifacts').update({
      byte_size: bytes.length,
      failure_code: null,
      generated_at: new Date().toISOString(),
      generation_status: 'ready',
      mime_type: 'application/pdf',
      sha256,
      storage_path: storagePath,
      updated_at: new Date().toISOString(),
    }).eq('id', claim.id).eq('generation_status', 'generating').select('*').single();
    if (completed.error || !completed.data) throw new Error('ARTIFACT_FINALIZATION_FAILED');
    return completed.data;
  } catch (error) {
    const failureCode = error instanceof Error && /^[A-Z_]+$/.test(error.message)
      ? error.message : 'PDF_GENERATION_FAILED';
    await db.from('lease_agreement_pdf_artifacts').update({
      failure_code: failureCode, generation_status: 'failed', updated_at: new Date().toISOString(),
    }).eq('id', claim.id).eq('generation_status', 'generating');
    throw new Error(failureCode);
  }
};

export const getAgreementPdfArtifact = async (agreementId: number) => {
  const result = await db.from('lease_agreement_pdf_artifacts').select('*').eq('source_agreement_id', agreementId).maybeSingle();
  if (result.error) throw new Error('ARTIFACT_LOOKUP_FAILED');
  return result.data || null;
};

export const createAgreementPdfSignedUrl = async (storagePath: string) => {
  const result = await db.storage.from(AGREEMENT_PDF_BUCKET).createSignedUrl(storagePath, 60 * 5);
  if (result.error || !result.data?.signedUrl) throw new Error('SIGNED_URL_FAILED');
  return result.data.signedUrl;
};
