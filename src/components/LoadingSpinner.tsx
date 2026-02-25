export default function LoadingSpinner() {
  return (
    <div className="flex justify-center items-center h-full min-h-[50vh]">
      <div className="w-12 h-12 border-2 border-brand-gold border-t-transparent rounded-full animate-spin"></div>
    </div>
  );
}
