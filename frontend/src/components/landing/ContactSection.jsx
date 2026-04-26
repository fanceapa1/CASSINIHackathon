import { motion, useInView } from "framer-motion";
import { useRef, useState } from "react";
import ScrambleTitle from "./ScrambleTitle";

const ContactSection = ({ sectionRef }) => {
  const localRef = useRef(null);
  const isInView = useInView(localRef, { 
      once: true, 
      amount: 0.2, 
      margin: "0px" 
  });
  const [status, setStatus] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatus("Sending...");

    const formData = new FormData(event.target);
    // Recomandare: Mută acest access_key într-un fișier .env
    formData.append("access_key", "cb5ff32d-5f64-4606-af08-3bb96cb11df2");

    try {
      const response = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        setStatus("Message sent successfully! We will get back to you soon.");
        event.target.reset();
      } else {
        console.error("Web3Forms Error:", data);
        setStatus("An error occurred. Please try again.");
      }
    } catch (error) {
      console.error("Network Error:", error);
      setStatus("Network error. Please check your connection.");
    }
  };

  return (
    <footer
      id="contact"
      ref={sectionRef}
      className="scroll-mt-28 border-t border-cyan-100/15 bg-[linear-gradient(180deg,rgba(4,11,25,0.86)_0%,rgba(2,7,18,0.95)_100%)] px-6 py-16 lg:px-8 lg:py-20"
    >
      <div ref={localRef} className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0 }}
          transition={{ duration: 0.6 }}
          className="space-y-4 will-change-transform"
        >
          <ScrambleTitle
            as="h2"
            text="Contact"
            className="font-heading text-3xl font-bold uppercase tracking-[0.04em] text-slate-100 sm:text-4xl"
          />
          <p className="max-w-md font-body text-base leading-relaxed text-slate-300 sm:text-lg">
            If you want a personalized demo or a quote for your organization, send us a few details and we will get back to you shortly.
          </p>
          <div className="space-y-2 font-body text-sm text-slate-400 sm:text-base">
            <p>hello@synoptis.com</p>
            <p>+40 721 000 111</p>
            <p>Bucharest, Romania</p>
          </div>
        </motion.div>

        <motion.form
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 28 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0 }}
          transition={{ duration: 0.65, delay: 0.08 }}
          className="rounded-[24px] border border-cyan-100/20 bg-[#071328]/80 p-6 shadow-[0_28px_60px_-38px_rgba(0,0,0,0.92)] backdrop-blur sm:p-8 will-change-transform"
        >
          <div className="grid gap-5">
            <label className="font-body text-sm font-semibold text-slate-200">
              Name
              <input
                type="text"
                name="name"
                required
                placeholder="Your name"
                className="mt-2 w-full rounded-xl border border-cyan-100/20 bg-[#030c1c] px-4 py-3 font-body text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-200/60"
              />
            </label>

            <label className="font-body text-sm font-semibold text-slate-200">
              Email
              <input
                type="email"
                name="email"
                required
                placeholder="name@company.com"
                className="mt-2 w-full rounded-xl border border-cyan-100/20 bg-[#030c1c] px-4 py-3 font-body text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-200/60"
              />
            </label>

            <label className="font-body text-sm font-semibold text-slate-200">
              Message
              <textarea
                name="message"
                required
                rows={5}
                placeholder="Tell us briefly what kind of support or quote you are looking for."
                className="mt-2 w-full resize-none rounded-xl border border-cyan-100/20 bg-[#030c1c] px-4 py-3 font-body text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-200/60"
              />
            </label>

            <button
              type="submit"
              className="rounded-full bg-cyan-300 px-6 py-3 font-body text-sm font-bold uppercase tracking-[0.08em] text-slate-950 transition hover:bg-cyan-200 sm:text-base disabled:cursor-not-allowed disabled:opacity-50"
              disabled={status === "Sending..."}
            >
              {status === "Sending..." ? "Sending..." : "Send Message"}
            </button>

            {status && status !== "Sending..." && (
              <p
                className={`font-body text-sm font-semibold ${
                  status.includes("success") ? "text-green-400" : "text-red-400"
                }`}
              >
                {status}
              </p>
            )}
          </div>
        </motion.form>
      </div>
    </footer>
  );
};

export default ContactSection;