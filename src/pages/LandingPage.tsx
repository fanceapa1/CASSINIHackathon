import { useRef } from 'react';
import ContactSection from '../components/ContactSection';
import FeatureSection from '../components/FeatureSection';
import HeroSection from '../components/HeroSection';
import Navbar from '../components/Navbar';
import PricingSection from '../components/PricingSection';
import { featureSections } from '../data/featureSections';

function LandingPage() {
  const featuresRef = useRef<HTMLElement | null>(null);
  const contactRef = useRef<HTMLElement | null>(null);

  const scrollToFeatures = () => {
    featuresRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const scrollToContact = () => {
    contactRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <Navbar onContactClick={scrollToContact} />

      <main className="relative z-10">
        <HeroSection onContactAction={scrollToContact} onPrimaryAction={scrollToFeatures} />

        <section
          id="features"
          ref={featuresRef}
          aria-label="Functionalitati"
          className="scroll-mt-28"
        >
          <div className="space-y-2">
            {featureSections.map((section, index) => (
              <FeatureSection key={section.id} reverse={index % 2 === 1} section={section} />
            ))}
          </div>
        </section>

        <PricingSection onContactClick={scrollToContact} />
      </main>

      <ContactSection sectionRef={contactRef} />
    </>
  );
}

export default LandingPage;
