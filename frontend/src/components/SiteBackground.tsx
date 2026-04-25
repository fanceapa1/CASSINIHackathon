export default function SiteBackground() {
  return (
    <>
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-30 space-sky" />
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-20 stars-layer" />
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 stars-layer stars-layer--far" />
    </>
  );
}
