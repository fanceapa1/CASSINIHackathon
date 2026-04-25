import { useRef } from 'react';
// @ts-expect-error jsx component
import ContactSection from '../components/landing/ContactSection';
// @ts-expect-error jsx component
import FeatureSection from '../components/landing/FeatureSection';
// @ts-expect-error jsx component
import HeroSection from '../components/landing/HeroSection';
// @ts-expect-error jsx component
import Navbar from '../components/landing/Navbar';
// @ts-expect-error jsx component
import PricingSection from '../components/landing/PricingSection';
// @ts-expect-error js module
import { featureSections } from '../data/featureSections';

export default function LandingPage() {
  const featuresRef = useRef<HTMLElement>(null);
  const contactRef = useRef<HTMLElement>(null);

  const scrollToFeatures = () => {
    featuresRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const scrollToContact = () => {
    contactRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="relative min-h-screen overflow-x-clip bg-[#04070f] text-slate-100">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-30 space-sky" />
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-20 stars-layer" />
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 stars-layer stars-layer--far" />

      <Navbar onContactClick={scrollToContact} />

      <main className="relative z-10">
        <HeroSection onPrimaryAction={scrollToFeatures} onContactAction={scrollToContact} />

        <section id="features" ref={featuresRef} aria-label="Functionalitati" className="scroll-mt-28">
          <div className="space-y-2">
            {(featureSections as { id: string }[]).map((section, index) => (
              <FeatureSection key={section.id} section={section} reverse={index % 2 === 1} />
            ))}
          </div>
        </section>

        <PricingSection onContactClick={scrollToContact} />
      </main>

      <ContactSection sectionRef={contactRef} />
    </div>
  );
}
