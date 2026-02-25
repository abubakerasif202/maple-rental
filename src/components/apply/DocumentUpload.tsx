import React from 'react';
import { motion } from 'motion/react';
import { Upload, CheckCircle2, Lock } from 'lucide-react';
import { ApplicationFormData } from '../../types/application';

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
};

interface DocumentUploadProps {
  formData: ApplicationFormData;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>, field: 'licensePhoto' | 'uberScreenshot') => void;
}

export default function DocumentUpload({ formData, onUpload }: DocumentUploadProps) {
  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-100px" }}
      variants={fadeIn}
    >
      <div className="flex items-center gap-3 mb-8 pb-4 border-b border-white/5">
        <Upload className="w-5 h-5 text-brand-gold" />
        <h2 className="text-xl font-serif font-bold text-white tracking-tight">Document Upload</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-4">
          <label className="text-xs font-bold text-brand-grey uppercase tracking-widest">Driver License (Front & Back)</label>
          <div className="relative group">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => onUpload(e, 'licensePhoto')}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
            />
            <div className={`border-2 border-dashed ${formData.licensePhoto ? 'border-brand-gold/50 bg-brand-gold/5' : 'border-white/10 group-hover:border-brand-gold/30'} p-8 text-center transition-all rounded-xl`}>
              {formData.licensePhoto ? (
                <div className="flex flex-col items-center gap-2">
                  <CheckCircle2 className="w-8 h-8 text-brand-gold" />
                  <span className="text-xs text-brand-gold font-bold uppercase tracking-widest">File Uploaded</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="w-8 h-8 text-brand-grey/40 group-hover:text-brand-gold transition-colors" />
                  <span className="text-xs text-brand-grey/60 font-light">Drag & drop or click to upload</span>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <label className="text-xs font-bold text-brand-grey uppercase tracking-widest">Uber Profile Screenshot (if active)</label>
          <div className="relative group">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => onUpload(e, 'uberScreenshot')}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
            />
            <div className={`border-2 border-dashed ${formData.uberScreenshot ? 'border-brand-gold/50 bg-brand-gold/5' : 'border-white/10 group-hover:border-brand-gold/30'} p-8 text-center transition-all rounded-xl`}>
              {formData.uberScreenshot ? (
                <div className="flex flex-col items-center gap-2">
                  <CheckCircle2 className="w-8 h-8 text-brand-gold" />
                  <span className="text-xs text-brand-gold font-bold uppercase tracking-widest">File Uploaded</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="w-8 h-8 text-brand-grey/40 group-hover:text-brand-gold transition-colors" />
                  <span className="text-xs text-brand-grey/60 font-light">Drag & drop or click to upload</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-8 flex items-start gap-3 p-4 bg-brand-charcoal/50 border border-white/5 rounded-lg">
        <Lock className="w-4 h-4 text-brand-gold mt-0.5" />
        <p className="text-[10px] text-brand-grey/60 font-light leading-relaxed">
          Files are securely stored and reviewed by MAPLE RENTALS management only. Your information is never shared with third parties.
        </p>
      </div>
    </motion.section>
  );
}
