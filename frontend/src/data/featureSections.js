import alertControlImage from "../assets/alert-control.svg";
import coordinationImage from "../assets/coordination.svg";
import predictiveAiImage from "../assets/predictive-ai.svg";

export const featureSections = [
  {
    id: "real-time-alerts",
    title: "Real-Time Flood Intelligence",
    description:
      "Centralize critical signals using Copernicus Sentinel-1 satellite processing and the JRC INFORM Risk Index. Get instant visibility on observed flood extents and risk levels across EU boundaries.",
    image: alertControlImage,
    imageAlt: "Live flood monitoring dashboard using satellite data"
  },
  {
    id: "field-coordination",
    title: "Swarm Evacuation Simulation",
    description:
      "Simulate and manage crisis zones using advanced swarm intelligence. Integrated Hermes AI agents help distribute rescue resources and map secure evacuation routes during dynamic disaster events.",
    image: coordinationImage,
    imageAlt: "Swarm intelligence network for emergency coordination"
  },
  {
    id: "predictive-models",
    title: "AI & Graph Topology Models",
    description:
      "Analyze cascading disaster impacts with dynamic Neo4j network graphs. Automatically evaluate regional topologies to anticipate flood progression and generate actionable insights before the situation escalates.",
    image: predictiveAiImage,
    imageAlt: "Neo4j predictive graph and AI topology models"
  }
];