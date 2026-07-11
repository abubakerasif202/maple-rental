import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Loader2, RefreshCw, ExternalLink, FileText, Trash2, Save, Eye, CheckCircle2, AlertCircle, Power } from 'lucide-react';
import { UseMutationResult, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Application } from '../../../types';
import * as api from '../../../lib/api';
import EmptyState from '../EmptyState';
import MarkdownTemplateEditor from '../MarkdownTemplateEditor';

interface AgreementsTabProps {
  approvedApplications: Application[];
  selected_agreement_application_id: string;
  set_selected_agreement_application_id: (val: string) => void;
  selectedAgreementApplication?: Application;
  isGeneratingAgreement: boolean;
  handleGenerateAgreement: () => void;
  canCopyVehicleCheckoutLink: boolean;
  generateCheckoutLinkMutation: UseMutationResult<
    any,
    Error,
    { application_id: string },
    unknown
  >;
  handleCopyVehicleCheckoutLink: () => void;
  savedAgreements: any[];
  setAgreementModalMode: (mode: 'draft' | 'saved') => void;
  setAgreementContent: (content: string) => void;
  setIsAgreementModalOpen: (val: boolean) => void;
  deleteAgreementMutation: UseMutationResult<any, Error, number, unknown>;
}

export default function AgreementsTab({
  approvedApplications,
  selected_agreement_application_id,
  set_selected_agreement_application_id,
  selectedAgreementApplication,
  isGeneratingAgreement,
  handleGenerateAgreement,
  canCopyVehicleCheckoutLink,
  generateCheckoutLinkMutation,
  handleCopyVehicleCheckoutLink,
  savedAgreements,
  setAgreementModalMode,
  setAgreementContent,
  setIsAgreementModalOpen,
  deleteAgreementMutation,
}: AgreementsTabProps) {
  const queryClient = useQueryClient();
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [editorContent, setEditorContent] = useState('');
  const [editorStatus, setEditorStatus] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);

  const approvedVehicleLabel =
    selectedAgreementApplication?.approved_vehicle?.trim() || '';
  const templatesQuery = useQuery({
    queryKey: ['agreement-templates'],
    queryFn: () => api.fetchAgreementTemplates(),
  });
  const templates = templatesQuery.data || [];
  const selectedTemplate = useMemo(
    () =>
      templates.find((template) => template.id === selectedTemplateId) ||
      templates.find((template) => template.active) ||
      templates[0],
    [selectedTemplateId, templates]
  );
  const activeTemplate = templates.find((template) => template.active);
  const templateVersions = selectedTemplate
    ? templates.filter((template) => template.template_key === selectedTemplate.template_key)
    : [];
  const hasTemplateChanges = Boolean(
    selectedTemplate && editorContent !== selectedTemplate.content
  );

  useEffect(() => {
    if (!selectedTemplate) {
      return;
    }

    if (selectedTemplateId !== selectedTemplate.id) {
      setSelectedTemplateId(selectedTemplate.id);
    }

    setEditorContent(selectedTemplate.content);
  }, [selectedTemplate?.id]);

  const saveTemplateMutation = useMutation({
    mutationFn: () => {
      if (!selectedTemplate) {
        throw new Error('No agreement template selected');
      }

      if (selectedTemplate.id === 0) {
        return api.createAgreementTemplate({
          content: editorContent,
          name: selectedTemplate.name,
          template_key: selectedTemplate.template_key,
        });
      }

      return api.updateAgreementTemplate(selectedTemplate.id, {
        content: editorContent,
        name: selectedTemplate.name,
      });
    },
    onMutate: async () => {
      if (!selectedTemplate) {
        return undefined;
      }

      await queryClient.cancelQueries({ queryKey: ['agreement-templates'] });
      const previousTemplates = queryClient.getQueryData<api.AgreementTemplate[]>([
        'agreement-templates',
      ]);

      queryClient.setQueryData<api.AgreementTemplate[]>(['agreement-templates'], (current) =>
        (current || []).map((template) =>
          template.id === selectedTemplate.id
            ? { ...template, content: editorContent, updated_at: new Date().toISOString() }
            : template
        )
      );

      return { previousTemplates };
    },
    onSuccess: (template) => {
      setSelectedTemplateId(template.id);
      setEditorContent(template.content);
      setEditorStatus({ message: `Saved version ${template.version}`, type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['agreement-templates'] });
      queryClient.invalidateQueries({ queryKey: ['application-agreement-template'] });
    },
    onError: (_error, _variables, context) => {
      if (context?.previousTemplates) {
        queryClient.setQueryData(['agreement-templates'], context.previousTemplates);
      }

      setEditorStatus({ message: 'Failed to save agreement template', type: 'error' });
    },
  });

  const activateTemplateMutation = useMutation({
    mutationFn: (id: number) => api.activateAgreementTemplate(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['agreement-templates'] });
      const previousTemplates = queryClient.getQueryData<api.AgreementTemplate[]>([
        'agreement-templates',
      ]);
      const target = previousTemplates?.find((template) => template.id === id);

      queryClient.setQueryData<api.AgreementTemplate[]>(['agreement-templates'], (current) =>
        (current || []).map((template) =>
          target && template.template_key === target.template_key
            ? { ...template, active: template.id === id }
            : template
        )
      );

      return { previousTemplates };
    },
    onSuccess: (template) => {
      setSelectedTemplateId(template.id);
      setEditorStatus({ message: `Version ${template.version} is active`, type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['agreement-templates'] });
      queryClient.invalidateQueries({ queryKey: ['application-agreement-template'] });
    },
    onError: (_error, _variables, context) => {
      if (context?.previousTemplates) {
        queryClient.setQueryData(['agreement-templates'], context.previousTemplates);
      }

      setEditorStatus({ message: 'Failed to activate agreement template', type: 'error' });
    },
  });

  const previewTemplateMutation = useMutation({
    mutationFn: () => {
      if (!selectedTemplate) {
        throw new Error('No agreement template selected');
      }

      return api.previewAgreementTemplate(selectedTemplate.id, {
        content: editorContent,
      } as api.LeaseAgreementPayload);
    },
    onSuccess: (response) => {
      setPreviewContent(response.agreement);
    },
    onError: () => {
      setEditorStatus({ message: 'Failed to preview agreement template', type: 'error' });
    },
  });

  return (
    <motion.div
      key="agreements"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-12"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="mb-2 text-3xl font-bold uppercase tracking-tighter text-white sm:text-4xl">
            Lease <span className="text-brand-gold italic">Agreements</span>
          </h2>
          <p className="text-brand-grey font-light">
            Edit active agreement templates and generate legally binding rental contracts.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-widest text-white">
                Templates
              </h3>
              <p className="mt-1 text-[11px] text-brand-grey">
                Active version: {activeTemplate ? `v${activeTemplate.version}` : 'Loading'}
              </p>
            </div>
            {templatesQuery.isFetching && <Loader2 className="h-4 w-4 animate-spin text-brand-gold" />}
          </div>

          {templatesQuery.isError && (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-100">
              Failed to load agreement templates.
            </div>
          )}

          <div className="space-y-3">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => setSelectedTemplateId(template.id)}
                className={`w-full rounded-2xl border p-4 text-left transition-all ${
                  selectedTemplate?.id === template.id
                    ? 'border-brand-gold bg-brand-gold/10'
                    : 'border-white/10 bg-brand-navy/40 hover:bg-white/5'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold text-white">{template.name}</p>
                  <span
                    className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${
                      template.active
                        ? 'bg-green-500/20 text-green-200'
                        : 'bg-white/5 text-brand-grey'
                    }`}
                  >
                    {template.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="mt-2 text-[11px] uppercase tracking-widest text-brand-grey">
                  Version {template.version}
                </p>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5">
          <div className="flex flex-col gap-4 border-b border-white/10 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-widest text-white">
                Agreement Editor
              </h3>
              <p className="mt-1 text-[11px] text-brand-grey">
                Last updated:{' '}
                {selectedTemplate?.updated_at
                  ? new Date(selectedTemplate.updated_at).toLocaleString()
                  : 'Not saved yet'}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <select
                value={selectedTemplate?.id ?? ''}
                onChange={(event) => setSelectedTemplateId(Number(event.target.value))}
                className="h-11 rounded-xl border border-white/10 bg-brand-navy px-4 text-xs font-bold uppercase tracking-widest text-white outline-none focus:border-brand-gold"
              >
                {templateVersions.map((template) => (
                  <option key={template.id} value={template.id}>
                    Version {template.version} {template.active ? '(Active)' : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!selectedTemplate || selectedTemplate.active || activateTemplateMutation.isPending}
                onClick={() => selectedTemplate && activateTemplateMutation.mutate(selectedTemplate.id)}
                className="flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 px-4 text-[10px] font-bold uppercase tracking-widest text-white transition-all hover:bg-white/10 disabled:opacity-50"
              >
                <Power className="h-4 w-4 text-brand-gold" />
                Activate
              </button>
              <button
                type="button"
                disabled={!selectedTemplate || previewTemplateMutation.isPending}
                onClick={() => previewTemplateMutation.mutate()}
                className="flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 px-4 text-[10px] font-bold uppercase tracking-widest text-white transition-all hover:bg-white/10 disabled:opacity-50"
              >
                {previewTemplateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Eye className="h-4 w-4 text-brand-gold" />
                )}
                Preview
              </button>
              <button
                type="button"
                disabled={!selectedTemplate || !hasTemplateChanges || saveTemplateMutation.isPending}
                onClick={() => saveTemplateMutation.mutate()}
                className="flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-gold px-4 text-[10px] font-bold uppercase tracking-widest text-brand-navy transition-all hover:bg-brand-gold-light disabled:opacity-50"
              >
                {saveTemplateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save
              </button>
            </div>
          </div>

          <div className="p-5">
            {editorStatus && (
              <div
                className={`mb-4 flex items-center gap-3 rounded-2xl border px-4 py-3 text-xs ${
                  editorStatus.type === 'success'
                    ? 'border-green-500/20 bg-green-500/10 text-green-100'
                    : 'border-red-500/20 bg-red-500/10 text-red-100'
                }`}
              >
                {editorStatus.type === 'success' ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
                {editorStatus.message}
              </div>
            )}
            <MarkdownTemplateEditor
              value={editorContent}
              onChange={setEditorContent}
            />
            <div className="mt-4 grid grid-cols-1 gap-3 text-[11px] text-brand-grey sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-brand-navy/40 px-4 py-3">
                Status: <span className="text-white">{selectedTemplate?.active ? 'Active' : 'Inactive'}</span>
              </div>
              <div className="rounded-2xl border border-white/10 bg-brand-navy/40 px-4 py-3">
                Version: <span className="text-white">{selectedTemplate?.version ?? '-'}</span>
              </div>
              <div className="rounded-2xl border border-white/10 bg-brand-navy/40 px-4 py-3">
                Characters: <span className="text-white">{editorContent.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 p-8 rounded-3xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-end">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-brand-grey uppercase tracking-widest">
              Select Approved Application
            </label>
            <select
              value={selected_agreement_application_id}
              onChange={(e) => {
                const applicationId = e.target.value;
                set_selected_agreement_application_id(applicationId);
              }}
              className="w-full bg-brand-navy border border-white/10 rounded-xl px-5 py-4 text-white focus:border-brand-gold outline-none transition-all font-light appearance-none"
            >
              <option value="">Select a driver...</option>
              {approvedApplications.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.name} ({app.email})
                </option>
              ))}
            </select>
            {approvedVehicleLabel && (
              <p className="text-[11px] text-brand-grey font-light">
                Registration: <span className="text-white">{approvedVehicleLabel}</span>
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3">
            <button
              disabled={
                isGeneratingAgreement ||
                !selected_agreement_application_id ||
                selectedAgreementApplication?.status !== 'Paid'
              }
              onClick={handleGenerateAgreement}
              className="bg-brand-gold text-brand-navy h-[58px] font-bold uppercase tracking-widest text-[10px] hover:bg-brand-gold-light transition-all shadow-lg flex items-center justify-center gap-3 disabled:opacity-50"
            >
              {isGeneratingAgreement ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Generate New Agreement
            </button>
            <button
              disabled={
                !canCopyVehicleCheckoutLink ||
                generateCheckoutLinkMutation.isPending
              }
              onClick={handleCopyVehicleCheckoutLink}
              className="bg-white/5 border border-white/10 text-white h-[58px] font-bold uppercase tracking-widest text-[10px] hover:bg-white/10 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
            >
              {generateCheckoutLinkMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ExternalLink className="w-4 h-4 text-brand-gold" />
              )}
              Copy Secure Payment Link
            </button>
          </div>
        </div>
        <p className="mt-4 text-[11px] text-brand-grey font-light">
          Secure payment links are signed and time-limited. Approve the
          application first so the registration and pricing are locked before
          copying a fresh link.
        </p>
        {selectedAgreementApplication &&
          selectedAgreementApplication.status !== 'Paid' && (
            <p className="mt-2 text-[11px] text-brand-grey font-light">
              Lease agreements unlock after the driver completes the approved
              payment.
            </p>
          )}
      </div>

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
        <div className="space-y-3 p-4 md:hidden">
          {savedAgreements.map((agreement: any) => (
            <article
              key={agreement.id}
              className="rounded-lg border border-white/10 bg-brand-navy/60 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-brand-gold">
                    #{agreement.id.toString().padStart(6, '0')}
                  </p>
                  <p className="mt-2 truncate text-sm font-bold text-white">
                    {agreement.applicant_name}
                  </p>
                  <p className="text-[10px] uppercase tracking-widest text-brand-grey">
                    {agreement.car_name || agreement.vehicle_label || 'Registration not recorded'}
                  </p>
                </div>
                <p className="shrink-0 text-xs text-brand-grey">
                  {new Date(agreement.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="flex min-h-11 items-center justify-center rounded-lg bg-white/5 px-4 text-brand-grey transition-all hover:bg-brand-gold hover:text-brand-navy"
                  onClick={() => {
                    setAgreementModalMode('saved');
                    setAgreementContent(agreement.content);
                    setIsAgreementModalOpen(true);
                  }}
                >
                  <FileText className="h-4 w-4" />
                </button>
                <button
                  className="flex min-h-11 items-center justify-center rounded-lg bg-white/5 px-4 text-red-500 transition-all hover:bg-red-500 hover:text-white"
                  onClick={() => {
                    if (window.confirm('Delete this agreement?')) {
                      deleteAgreementMutation.mutate(agreement.id);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </article>
          ))}
          {savedAgreements.length === 0 && (
            <EmptyState
              description="Finalized lease agreements will appear here after a paid application is selected and generated."
              icon={FileText}
              title="No agreements generated"
            />
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px] text-left">
          <thead>
            <tr className="bg-white/5 border-b border-white/10">
              <th className="px-8 py-6 text-[10px] font-bold text-brand-grey uppercase tracking-widest">
                Agreement ID
              </th>
              <th className="px-8 py-6 text-[10px] font-bold text-brand-grey uppercase tracking-widest">
                Driver & Vehicle
              </th>
              <th className="px-8 py-6 text-[10px] font-bold text-brand-grey uppercase tracking-widest">
                Generated On
              </th>
              <th className="px-8 py-6 text-[10px] font-bold text-brand-grey uppercase tracking-widest text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {savedAgreements.map((agreement: any) => (
              <tr
                key={agreement.id}
                className="hover:bg-white/5 transition-all group"
              >
                <td className="px-8 py-6 text-xs text-brand-gold font-bold">
                  #{agreement.id.toString().padStart(6, '0')}
                </td>
                <td className="px-8 py-6">
                  <div>
                    <p className="text-sm font-bold text-white">
                      {agreement.applicant_name}
                    </p>
                    <p className="text-[10px] text-brand-grey uppercase tracking-widest">
                      {agreement.car_name || agreement.vehicle_label || 'Registration not recorded'}
                    </p>
                  </div>
                </td>
                <td className="px-8 py-6 text-xs text-brand-grey">
                  {new Date(agreement.created_at).toLocaleDateString()}
                </td>
                <td className="px-8 py-6 text-right">
                  <div className="flex justify-end gap-2 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                    <button
                      className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/5 text-brand-grey transition-all hover:bg-brand-gold hover:text-brand-navy"
                      onClick={() => {
                        setAgreementModalMode('saved');
                        setAgreementContent(agreement.content);
                        setIsAgreementModalOpen(true);
                      }}
                    >
                      <FileText className="w-4 h-4" />
                    </button>
                    <button
                      className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/5 text-red-500 transition-all hover:bg-red-500 hover:text-white"
                      onClick={() => {
                        if (window.confirm('Delete this agreement?')) {
                          deleteAgreementMutation.mutate(agreement.id);
                        }
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {savedAgreements.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <EmptyState
                    description="Finalized lease agreements will appear here after a paid application is selected and generated."
                    icon={FileText}
                    title="No agreements generated"
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {previewContent && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-brand-navy/60 backdrop-blur-xl sm:items-center sm:p-6">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-brand-navy shadow-2xl sm:rounded-3xl">
            <div className="flex items-center justify-between border-b border-white/10 bg-white/5 p-5 sm:p-7">
              <div>
                <h3 className="text-xl font-bold uppercase tracking-tighter text-white">
                  Agreement Preview
                </h3>
                <p className="mt-1 text-[10px] uppercase tracking-widest text-brand-grey">
                  Rendered with sample rental data
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewContent(null)}
                className="min-h-11 rounded-full bg-white/5 px-4 text-brand-grey hover:text-white"
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 sm:p-8">
              <pre className="whitespace-pre-wrap rounded-2xl border border-white/10 bg-white/[0.02] p-5 font-sans text-sm leading-7 text-brand-grey">
                {previewContent}
              </pre>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
