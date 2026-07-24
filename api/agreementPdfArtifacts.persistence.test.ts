import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;

const {
  mockState,
  mockRpc,
  mockStorageDownload,
  mockStorageUpload,
} = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockState: {
    artifacts: [] as Row[],
    agreements: [] as Row[],
  },
  mockStorageDownload: vi.fn(),
  mockStorageUpload: vi.fn(),
}));

const readRows = (table: string) => {
  if (table === 'lease_agreements') return mockState.agreements;
  if (table === 'lease_agreement_pdf_artifacts') return mockState.artifacts;
  return [];
};

const writeRows = (table: string, rows: Row[]) => {
  if (table === 'lease_agreements') mockState.agreements = rows;
  if (table === 'lease_agreement_pdf_artifacts') mockState.artifacts = rows;
};

const createQuery = (table: string) => {
  const filters: Array<{ column: string; value: unknown }> = [];
  let insertRows: Row[] | null = null;
  let updatePayload: Row | null = null;

  const applyFilters = (rows: Row[]) =>
    rows.filter((row) =>
      filters.every((filter) => String(row[filter.column]) === String(filter.value))
    );

  const query = {
    eq(column: string, value: unknown) {
      filters.push({ column, value });
      return query;
    },
    insert(rows: Row[]) {
      insertRows = rows;
      return query;
    },
    maybeSingle() {
      const rows = applyFilters(readRows(table));
      return Promise.resolve({ data: rows[0] || null, error: null });
    },
    select() {
      if (insertRows) {
        const rows = readRows(table);
        const inserted = insertRows.map((row, index) => ({
          id: rows.length + index + 1,
          ...row,
        }));
        writeRows(table, [...rows, ...inserted]);
        insertRows = inserted;
      }
      return query;
    },
    single() {
      if (insertRows) {
        return Promise.resolve({ data: insertRows[0] || null, error: null });
      }

      if (updatePayload) {
        const rows = readRows(table);
        const matchingRows = applyFilters(rows);
        const target = matchingRows[0];
        if (!target) return Promise.resolve({ data: null, error: { message: 'No rows' } });
        Object.assign(target, updatePayload);
        return Promise.resolve({ data: target, error: null });
      }

      const rows = applyFilters(readRows(table));
      return Promise.resolve({
        data: rows[0] || null,
        error: rows[0] ? null : { message: 'No rows' },
      });
    },
    then(resolve: (value: { data: null; error: null }) => unknown) {
      if (updatePayload) {
        const rows = readRows(table);
        for (const row of applyFilters(rows)) {
          Object.assign(row, updatePayload);
        }
      }

      return Promise.resolve({ data: null, error: null }).then(resolve);
    },
    update(payload: Row) {
      updatePayload = payload;
      return query;
    },
  };

  return query;
};

vi.mock('./db/index.js', () => ({
  db: {
    from: (table: string) => createQuery(table),
    rpc: mockRpc,
    storage: {
      from: () => ({
        download: mockStorageDownload,
        upload: mockStorageUpload,
        createSignedUrl: vi.fn(),
      }),
    },
  },
}));

const {
  AGREEMENT_PDF_GENERATOR_VERSION,
  generateAgreementPdfArtifact,
} = await import('./agreementPdfArtifacts.js');

describe('agreement PDF artifact persistence', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockStorageDownload.mockReset();
    mockStorageUpload.mockReset();
    mockState.agreements = [
      {
        agreement_template_version: 4,
        content: 'Immutable signed agreement',
        id: 7,
      },
    ];
    mockState.artifacts = [];
  });

  it('returns an existing ready artifact without uploading another PDF', async () => {
    mockState.artifacts = [
      {
        generation_status: 'ready',
        id: 11,
        source_agreement_id: 7,
        storage_path: 'agreements/7/existing.pdf',
      },
    ];

    await expect(generateAgreementPdfArtifact(7)).resolves.toMatchObject({
      generation_status: 'ready',
      id: 11,
      storage_path: 'agreements/7/existing.pdf',
    });

    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockStorageUpload).not.toHaveBeenCalled();
  });

  it('claims, uploads, verifies, and finalizes a new artifact for a saved agreement', async () => {
    mockRpc.mockImplementation(async (_name: string, params: { p_artifact_id: number }) => {
      const artifact = mockState.artifacts.find((row) => row.id === params.p_artifact_id);
      if (artifact) artifact.generation_status = 'generating';
      return {
        data: { id: params.p_artifact_id },
        error: null,
      };
    });
    mockStorageUpload.mockResolvedValue({ data: { path: 'stored.pdf' }, error: null });
    mockStorageDownload.mockImplementation(async (path: string) => {
      const storagePathHash = path.split('/').at(-1)?.replace(/\.pdf$/, '');
      const generatedArtifact = mockState.artifacts.find(
        (artifact) => artifact.storage_path === path
      );

      expect(generatedArtifact?.sha256 || storagePathHash).toBeTruthy();
      return {
        data: {
          arrayBuffer: async () => {
            const { renderSavedAgreementPdf } = await import('./agreementPdfArtifacts.js');
            return renderSavedAgreementPdf('Immutable signed agreement');
          },
        },
        error: null,
      };
    });

    const artifact = await generateAgreementPdfArtifact(7);

    expect(artifact).toMatchObject({
      failure_code: null,
      generation_status: 'ready',
      generator_version: AGREEMENT_PDF_GENERATOR_VERSION,
      source_agreement_id: 7,
      template_version: 4,
    });
    expect(artifact.byte_size).toBeGreaterThan(1_000);
    expect(artifact.storage_path).toMatch(/^agreements\/7\/[a-f0-9]{64}\.pdf$/);
    expect(mockStorageUpload).toHaveBeenCalledOnce();
  });

  it('marks the claimed artifact failed when storage upload fails', async () => {
    mockRpc.mockImplementation(async (_name: string, params: { p_artifact_id: number }) => {
      const artifact = mockState.artifacts.find((row) => row.id === params.p_artifact_id);
      if (artifact) artifact.generation_status = 'generating';
      return {
        data: { id: params.p_artifact_id },
        error: null,
      };
    });
    mockStorageUpload.mockResolvedValue({
      data: null,
      error: { message: 'bucket unavailable' },
    });

    await expect(generateAgreementPdfArtifact(7)).rejects.toThrow('STORAGE_UPLOAD_FAILED');

    expect(mockState.artifacts[0]).toMatchObject({
      failure_code: 'STORAGE_UPLOAD_FAILED',
      generation_status: 'failed',
      source_agreement_id: 7,
    });
  });
});
