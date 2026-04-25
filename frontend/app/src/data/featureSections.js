import alertControlImage from "../assets/alert-control.svg";
import coordinationImage from "../assets/coordination.svg";
import predictiveAiImage from "../assets/predictive-ai.svg";

export const featureSections = [
  {
    id: "real-time-alerts",
    title: "Alerta In Timp Real",
    description:
      "Centralizezi semnalele critice din teren intr-un singur flux live. Echipele vad instant ce se intampla, unde se intampla si ce nivel de urgenta are fiecare incident.",
    image: alertControlImage,
    imageAlt: "Dashboard pentru alerta in timp real"
  },
  {
    id: "field-coordination",
    title: "Coordonare Echipe In Teren",
    description:
      "Distribui resursele inteligent si urmaresti progresul operatiunilor in fiecare punct. Fluxurile de lucru devin clare, iar deciziile se iau rapid, cu context complet.",
    image: coordinationImage,
    imageAlt: "Retea de coordonare echipe"
  },
  {
    id: "predictive-models",
    title: "Modele Predictive Cu AI",
    description:
      "Analizezi tipare de risc si anticipezi evolutia evenimentelor inainte sa escaladeze. Platforma iti ofera recomandari actionabile pentru prioritizare si raspuns eficient.",
    image: predictiveAiImage,
    imageAlt: "Grafic cu modele predictive AI"
  }
];
