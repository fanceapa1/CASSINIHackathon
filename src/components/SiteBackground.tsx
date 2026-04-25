function SiteBackground() {
  return (
    <>
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-40 space-sky" />
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-30 stars-layer" />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-20 stars-layer stars-layer--far"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.08),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(249,115,91,0.08),transparent_28%)]"
      />
    </>
  );
}

export default SiteBackground;
