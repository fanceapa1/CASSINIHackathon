Page 1
International Journal of Applied Earth Observation and Geoinformation 139 (2025) 104527

<img>Elsevier logo</img>

Contents lists available at ScienceDirect

International Journal of Applied Earth Observation and Geoinformation
journal homepage: www.elsevier.com/locate/jag

<img>Journal cover image</img>

More intelligent knowledge graph: A large language model-driven method for knowledge representation in geospatial digital twins

Jinbin Zhanga, Jun Zhua, *, Zhihao Guoa, Jianlin Wua, Yukun Guoa, Jianbo Laib, Weilian Lia

a Faculty of Geosciences and Engineering, Southwest Jiaotong University, Chengdu 611756, China b School of Emergency Management, Chengdu University, Chengdu 610106, China

<img>Check for updates</img>

A R T I C L E I N F O
Keywords: Geospatial digital twins Knowledge graph Large language model Knowledge extraction Dynamic update

A B S T R A C T
Knowledge graphs (KGs) can describe the nature and relationships of geographic entities and are an essential knowledge base for realizing geospatial digital twins (GDTs). However, existing KGs make it challenging to describe dynamic geographic entities under geographic spatiotemporal evolution accurately. Furthermore, they are constrained by the professional backgrounds of their users, which hinders updates and communication. Therefore, the research constructed an “event-object-state” three-domain associated GDT-oriented KG, proposed a large language model (LLM) –driven KG dynamic update algorithm, and established a KG intelligent Q&A method integrating LLM. We developed a prototype system and selected an earthquake disaster as a typical geographic event for experimental analysis. The results showed that the proposed method can reflect the space, time, state, evolution process, and interrelationships of geographic entities in a more comprehensive way, support users to build, update, and query KGs using natural language, with an updating efficiency of less than 1 min, and an updating quality comparable to that of manual updating by experts. Compared with the traditional KGs, our method can represent virtual geographic entities and has significant advantages in intelligence and automation, which effectively breaks down professional barriers and supports the construction of GDTs with the need for rapid updating of knowledge.

1. Introduction
“How to organize, store, and represent geographic knowledge scientifically?” has long been a central scientific concern of geographers (Golledge 2002; Yuan 2022). Knowledge is the sum of the results of human exploration of the material world and the spiritual world, and it symbolizes the wisdom of human beings. Geographic knowledge is an extension of the “knowledge” concept in geography, a kind of complex interrelationships, structured, interconnected, and constantly growing information (Lin and Chen 2015; Maude 2016; Zhu et al., 2024d; Li et al., 2024b). Currently, most definitions of geographic knowledge are premised on using computers and consider geographic knowledge as higher-level information obtained from data and information representing geographic phenomena (Li et al., 2024a; Lin et al., 2013).

Geospatial digital twins (GDTs) are an emerging concept that consists of a physical geographic environment (PGE), a virtual geographic environment (VGE), and a description of the connections between the PGE and the VGE (Döllner 2020; Zhang et al. 2024a). By mapping the events, objects, and states of the PGE into the VGE, it can diagnose past problems, assess current states, and predict future trends (Zhang et al. 2023; Wu et al. 2023). Geographic knowledge is an essential support for GDTs, providing the necessary information base for GDTs (Lin et al. 2022; Zhu et al. 2024c). However, traditional geographic knowledge representation models often show only the geographical spatiotemporal changes of individual geographic elements and cannot describe the interactions and semantic relationships between elements (Zheng et al. 2013, Shi et al. 2019). The dynamic complexity of GDTs presents a significant challenge to the effective organization and expression of geographic knowledge. The clutter of geographic knowledge, in turn, impedes the further development of GDTs.

Knowledge graphs (KGs) are knowledge representations that reveal concepts and relationships between concepts. It represents various concepts as nodes and the relationship between concepts as a connecting line between two nodes to construct a knowledge network based on graph structure (Fensel et al. 2020). Compared with concept definitions, classification systems, graphical representations, framework

Corresponding author. E-mail addresses: zhangjinbin@my.swjtu.edu.cn (J. Zhang), zhujun@swjtu.edu.cn (J. Zhu), vgezh@my.swjtu.edu.cn (Z. Guo), wujianlin@my.swjtu.edu.cn (J. Wu), gyk@my.swjtu.edu.cn (Y. Guo), laijianbo@cdu.edu.cn (J. Lai), vgewilliam@my.swjtu.edu.cn (W. Li).
https://doi.org/10.1016/j.jag.2025.104527 Received 24 November 2024; Received in revised form 24 March 2025; Accepted 6 April 2025 Available online 13 April 2025 1569-8432/© 2025 The Author(s). Published by Elsevier B.V. This is an open access article under the CC BY license (http://creativecommons.org/licenses/by/4.0/).

Page 2
J. Zhang et al.

representations, and other knowledge expressions, KGs can present each piece of knowledge individually and reveal its relationship with different concepts, which is more suitable for the expression, organization, and association of complete knowledge in large-scale data nowadays (Ding et al. 2022; Lai et al. 2023). Geographic KG is a domain-specific application of KG, which concentrates on the organization of geographic information, with a particular focus on geographic entities, and describes the nature and relationships among geographic entities (Zheng et al. 2022; Wang et al. 2019; Zhang et al. 2024b). However, most of the current research on geographic KGs stays on static data, and the updating of knowledge still relies on manual updating by experts, which makes it challenging to meet the real-time knowledge requirements of GDTs (Zhu et al. 2024c). In addition, most of the existing KG software requires specific query language, which requires users to have a particular graph database background, making it difficult for new users to get started, and the interaction method is highly unfriendly to the general public.

The emergence of large language models (LLMs) has brought a twist to solving these problems. For example, BERT (Bidirectional Encoder Representations from Transformers) can simultaneously consider contextual information and is suitable for text understanding tasks such as named entity recognition (Zhou et al. 2024). At the same time, GPT (Generative Pre-trained Transformer) excels in text generation tasks such as dialogue systems and machine translation (Wang et al. 2024). These models are based on neural network techniques, trained on large-scale textual data, and can capture language’s deep semantic and structural features. LLMs can be applied to automatically identify and extract critical information from unstructured data to form new knowledge points and relationships (Li et al. 2023; Dagdelen et al. 2024). This capability is crucial for rapidly updating and expanding geographic KGs, especially in changing geospatial environments, to promptly reflect new or changing geographic entity states (Hu et al. 2023). Furthermore, LLMs can provide natural language query and interaction functions, enabling users to query complex geospatial problems in natural language (Kefalidis et al. 2024). It lowers the threshold for professional geographic information system (GIS) and knowledge base software operation and facilitates expanding, popularizing, and applying KGs (Zhu et al. 2024b). However, although LLMs can understand and generate language, they lack deep domain-specific knowledge, which may lead to mistakes in understanding complex geographic terms or generating accurate geographic information. In addition, LLMs are often viewed as “black-box” models in which decision-making processes are challenging to track and interpret.

In summary, LLMs are more capable of applying language and data than KGs, and KGs are more capable of expressing knowledge than LLMs. While LLMs solve the existing problems of KGs, KGs can also compensate for some of the deficiencies of LLMs by providing structured expert domain knowledge. Human-machine cooperation is a realistic need in the future. If the advantages of LLMs can be fully utilized in KGs, the knowledge updating problem currently faced by GDTs is expected to be solved. With this in mind, we innovatively propose an LLMs-driven knowledge representation method for GDTs. We aim to construct a GDT-oriented KG that can represent the dynamic changes of geographic events, objects, and states, enhance its dynamic updating and intelligent querying capabilities, and break the professional barriers between the traditional KGs and users. First, we establish an integrated representation model of “event domain-object domain-state domain” and construct GDT ontology and GDT-oriented KG based on it. Second, we propose an ontology-guided chained LLMs knowledge extraction method and KG-enhanced LLM entity linking algorithm for dynamic updating of the GDT-oriented KG. Finally, we integrate the advantages of both LLMs and KGs to form an intelligent KG for GDT, which supports users’ Q&A and communication with the KG through natural language.

The remainder of the paper is organized as follows. Section 2 reviews related research informing our approach. Section 3 describes our approach. Section 4 carries out the experimental analysis. Sections 5 and 6 provide discussion and conclusion, respectively.

International Journal of Applied Earth Observation and Geoinformation 139 (2025) 104527

2. Related work
2.1. Geographic KGs
Geographic KG is a form of geographic knowledge expression, which has been widely used in the fields of weather simulation, emergency management, and intelligent construction by integrating and reasoning about geographic information (Li et al. 2021a; Lai et al. 2023; Zhu et al. 2024a). Geographic KGs can be classified into two main categories according to their functions. The first category pertains to the description of associative relationships between geographical scene objects. The second category concerns the description of temporal and spatial processes within geographical scenes.

The first category of KGs facilitates a more comprehensive understanding of the content of geographical scenes, thereby informing scene modeling and representation. For example, Zhu et al. (2024a) established a geographic KG to help construct a virtual disaster scene for public risk perception by sorting out the relationships among scenario objects, public needs, and diversified users. Tang et al. (2023) constructed a geographic KG for mountain highways to help guide the modeling of a twin scene by clarifying the data, object types, and interrelationships in the scene of mountain highways.

The second category of KGs is generally used to help people understand the changing state of a geographical entity. It adds elements such as time, location, etc., to a typical triad to represent the differences of geographic entities over time. For example, Tasnim et al. (2019) constructed different period versions of KGs based on DBpedia. Wang et al. (2019) expressed six basic elements of geographic entities: location, time, attributes, state, change, and relation in a KG.

However, the above geographic KGs still have some problems that lead to their inapplicability to GDTs: (1) the lack of representation of the association between real and virtual entities, which does not reflect the interaction process between PGE and VGE; and (2) the lack of representation of the complex associations between geographic events and entities, and the unclear role relationships between geographic events, objects, and states.

2.2. Combination of LLMs and KGs
In addition to manual construction by experts, previous studies have also commonly used the Named Entity Recognition (NER) approach to construct geographic KGs (Fan et al. 2019; Sun et al. 2021). NER is a technique for assigning entities mentioned in unstructured text to predefined categories, which usually relies on predefined entity types and labels. It leads to the construction of high-quality NER models that require a large amount of manually labeled data and high labeling costs. Furthermore, NER methods mainly focus on word-level entity recognition, lack an in-depth understanding of complex contexts, and have limited ability to handle complex relationships between entities (Tao et al. 2022).

LLMs are pre-trained models that reduce the dependence on labeled data compared to NER methods and have a stronger contextual understanding, providing a new way to build KGs. However, the research on the combination of LLMs and KGs is still in its infancy, and most scholars are currently putting more effort into enhancing the various capabilities of LLMs (Pan et al. 2024). For example, Zhu et al. (2024b) proposed an LLM framework constrained by flood KGs, aiming to allow LLMs to provide accurate and comprehensive flood information. Guo et al. (2022) built a medical question-answering system based on LLMs and KGs, utilizing KGs to enhance the reliability of LLMs’ knowledge reasoning. Andrus et al. (2022) utilized external dynamic KGs to improve story comprehension in LLMs and address the problem of context window limitation in LLMs.

As mentioned in the introduction, the advantages of LLMs are also an

<page_number>2</page_number>

Page 3
J. Zhang et al.

excellent complement to KGs. However, how to effectively use LLMs to compensate for the problems of difficulty in updating traditional KGs, inconsistent knowledge, and inefficient user communication is an essential challenge for future KGs research. In addition, the combination of LLMs and KGs still has a significant gap in the field GIS, and few existing studies have integrated LLMs with geographic KGs. Therefore, how to fully utilize the advantages of both to solve geographic problems and improve geographic analysis may be a hot topic in future GIS.

Methodology
3.1. Research framework overview

The research framework is shown in Fig. 1. First, we established the integrated representation model of “event-object-state”, which is used to guide the construction of GDT ontology. On this basis, we investigated the semantic mapping relationship between ontology and KG and constructed a GDT-oriented KG. Second, we proposed an ontology-guided LLM knowledge extraction method, and designed a KG-enhanced algorithm for entities linking using a LLM to support dynamic updating of GDT-oriented KG. Finally, with the two-way augmentation of KG and LLM, we established a communication mechanism between LLM and KG to form an intelligent KG for GDTs.

3.2. Construction of GDT-oriented KG with the three-domain association

3.2.1. Event-object-state integrated representation model

Existing geographic KGs lack the representation of the complex associations among geographic events, objects, and states. Furthermore, they do not take into account the interaction between physical and virtual geographic environments. This makes it challenging to reflect the dynamic spatiotemporal processes of GDTs effectively (Li et al. 2020; Zheng et al. 2022). (Li et al. 2020; Zheng et al. 2022). Therefore, we proposed an integrated representation conceptual model of “event domain-object domain-state domain” to support the subsequent construction of GDT ontology and KG, as shown in Fig. 2.

(1) Event domain

Geographic events serve as the driving force for geographic change, which can affect alterations in elements of the object domain or trigger shifts in elements of the state domain. In the event domain, we define the event that causes the change, the start and end time of the event, and the location of the event. For example, an earthquake event with a start time of March 12, 2024, an end time of March 13, 2024, and a location in Sichuan, China, affects the number of building objects and triggers a change in the state of the terrain.

(2) Object domain

The object domain represents the primary participant in a geographic event and is a collection of all geographic entities. The object domain can be broadly classified into three categories: natural

International Journal of Applied Earth Observation and Geoinformation 139 (2025) 104527

geographic elements, human geographic elements, and virtual geographic elements. Natural geographic elements include terrain, sky, ocean, river, forest, etc. Human geographic elements include cities, roads, bridges, buildings, farmland, etc. Virtual geographic scene elements refer to the representation of the natural geographic environment in the information space, such as virtual terrain, virtual buildings, virtual bridges, and so on.

(3) State domain

The state domain is a semantically changing representation of elements’ spatiotemporal attributes, which reveals the geographical time, space, feature, and data states of the geographical entity at one stage, often with the changes in the event and object domains. Among them, time is an inherent attribute of all things and is the key feature of dynamic change of geographic entities; space refers to the current location, attitude, etc., of geographic entities; feature mainly expresses the number, size, and other attribute information of geographic entities; and data represents the current storage form of geographic entities in the information space, such as 3D models, text, images and so on.

3.2.2. GDT ontology with the three-domain association

An ontology conceptualizes and explicitly defines objects and expresses the relationships between them in a uniform and formal way (Li et al., 2021b). It is a conceptual template for KGs that can increase the reusability of geographic knowledge and the exchange of information between domains. Based on the three-domain associative integrated representation model above, we defined the GDT ontology through the following structure:

$$Ontology = {Object, Event, State | Relation} # \quad (1)$$

Where Ontology represents the GDT ontology, Object represents the geographic entities in the object domain, including real geographic objects and virtual geographic objects, Event represents the geographic events, State represents the current state of the geographic entities, including Time, Location, Data, Feature, etc., and Relation represents the semantic relationship between entities, which can be mainly categorized into the following four types.

(1) Temporal relationship is a sequential relationship between two different periods.

(2) Spatial relationship is the relationship of spatial orientation between different entities.

(3) Containment relationship refers to the inheritance relationship between a parent class and a child class.

(4) Interactive relationship refers to the interaction between different entities, including effect, trigger, evolution, accompaniment, and so on.

Subsequently, we selected the Protégé software to create and edit the ontology, which is an open-source ontology tool developed by Stanford University, and the structure of the ontology is shown in Fig. 3. Such an ontology hierarchy helps people better understand the inherent

<img>Overall research framework diagram. The diagram shows a flow from LLM and KG inputs, through an integrated representation model for GDT, GDT ontology, and GDT-oriented KG. This leads to an intelligent KG for GDT. The process is supported by expert domain knowledge support and natural language comprehension support. The outputs include ontology-guided LLM knowledge extraction, KG-enhanced LLM entity linking, and LLM-driven dynamic updating of KG. The diagram also highlights improvement of knowledge extraction accuracy and enhanced capacity to reason and update knowledge.</img>

Fig. 1. Overall research framework.

<page_number>3</page_number>

Page 4
J. Zhang et al. International Journal of Applied Earth Observation and Geoinformation 139 (2025) 104527

<img>Event-object-state integrated representation model</img> Fig. 2. Event-object-state integrated representation model.

<img>Conceptual hierarchy of the ontology of GDT</img> Fig. 3. Conceptual hierarchy of the ontology of GDT.

geographical spatiotemporal correlations of GDTs on the one hand, and can be used to guide the construction of subsequent KG on the other.

3.2.3. Semantic mapping between ontology and KG
The GDT-oriented KG constructed in this paper contains a two-level logical structure of the data layer and schema layer. The schema layer is the GDT ontology built in the previous section, while the data layer concretizes and expresses the concepts, entities, relationships, and attributes in the ontology to form a complex knowledge network. The mapping relationship between the schema layer and the data layer is shown in Fig. 4.

Specifically, we mapped the event, object, and state concepts in the ontology to the nodes in the KG and the relationships in the ontology to the relationships in the KG. Constructing the GDT-oriented KG is beneficial for us in storing better geographic knowledge and more clearly describing the semantic relationships between geographic events, geographic states, real geographic objects, and virtual geographic objects so as to provide reliable expert knowledge for LLMs.

3.3. Dynamic update of GDT-oriented KG driven by LLM
GDTs are a cyclical and dynamic process and thus require continuous supplementation and updating of the KGs (Zhang et al. 2024a). Traditional KG updating requires strict structured knowledge and manual updating by experts, leading to inefficient updating. In this section, we utilized a large language model to update the KG automatically, and we aim to improve the intelligence of KG construction.

3.3.1. Ontology-guided LLM knowledge extraction
Knowledge extraction using LLMs can provide a ubiquitous textual database for KG updating (Dagdelen et al. 2024). However, when traditional LLMs perform knowledge extraction, they usually generate the final extraction results directly based on the input contextual information. This end-to-end extraction approach has certain limitations: (1) It is difficult for LLMs to explicitly express the intermediate steps and logical chains of knowledge extraction, resulting in extracted knowledge that often does not meet the specific domain requirements. (2) The knowledge extracted by LLMs is haphazard, resulting in irregularities in the form of the extracted entities and relationships, which makes it difficult to complement specific nodes of the KG efficiently. Therefore,

<page_number>4</page_number>

Page 5
J. Zhang et al. International Journal of Applied Earth Observation and Geoinformation 139 (2025) 104527

<img>Diagram showing the mapping of relationships between an ontology and a knowledge graph (KG). The top layer, "Schema layer," contains "Geographic events" and "Entity state" in an orange box, and "Virtual objects" and "Real objects" in a dashed orange box. Arrows indicate relationships like "ContainedBy," "Contain," "EffectedBy," "Represent," and "RepresentedBy." The middle layer, "Data layer," contains "Earthquake," "Entity state," "Virtual terrain," and "Real terrain" in a blue box, with "Relationship" arrows. The bottom layer shows "Time," "Location," "Feature," "Data," and "..." in a blue box. Arrows point from the "Data layer" to the "Schema layer" and from the "Data layer" to the "Graph structure" below.</img> Fig. 4. Mapping relationships between the ontology and KG.

under the guidance of the GDT ontology in Section 3.2.2, we constructed a system-prompt template and a few-shot template to improve the accuracy and standardization of extracting geographic entities for the LLM.

In terms of system-prompt template construction, we standardized the roles, goals and notices, etc., of the LLM, aiming at extracting geographic information from the text and constructing the geographic KG. Meanwhile, we combined the GDT ontology concepts to sort out the core elements for creating a geographic KG, including node labels, node IDs, node relationships, etc., in order to form a system prompt template. In terms of few-shot template construction, we guided the large language model to extract geographic knowledge in steps based on the ontology hierarchy with the help of the idea of a few-shot chain of thought. First, we extracted some geography-related materials from Wikipedia as sample inputs. Second, we extracted all geographic entities of a given text. Third, we categorized all geographic entities according to the concepts in the ontology and defined the labels. Finally, we defined all relationships in a given text with reference to the relationships between ontology concepts in order to form the few-shot template, as shown in Fig. 5.

3.3.2. Kg-enhanced LLM entity linking
Due to the diversity and uncertainty of natural languages, geographic entities extracted through LLMs often have ambiguities and errors (Zhu et al. 2024b). Therefore, before updating the KG, we first needed to clean up and disambiguate the knowledge extracted in Section 3.3.1. Entity linking is the process of associating entity names in text with unique identifiers in the knowledge base. This process helps aggregate and integrate information from multiple sources, effectively improving the reliability of knowledge extraction for LLMs and reducing the redundancy of the KG.

KG stores expert domain knowledge in a structured form, thereby providing a rich and reliable knowledge background for entity linking. First, we used OpenAI's text-embedding-ada-002 model to convert the KG instances constructed in Section 3.2 into vector data and store them in a vector database. The converted vectors correspond to the original information that the KG has the same unique identifier. Second, we utilized cosine similarity to determine the similarity between the entities extracted by LLM and those in the KG. We measured the angle between the vectors; the smaller the angle, the higher the similarity. Finally, we linked the entities with the highest similarity and were larger than a specific threshold value. Then, we replaced the entities extracted by LLM using the instance names in the KG to improve the accuracy of knowledge extraction. It is important to note that among entity linking tasks, similarity greater than 0.8 is usually considered to be able to ensure that the linked entities are correct basically, but at the same time, some correct links are lost (Wang et al. 2011; Song et al. 2016). Given the potential for significant variations in user knowledge backgrounds and the ongoing expansion of the KG, it is crucial to minimize the loss of accurate links. We repeatedly experimented in the interval of 0.7 ~ 0.8 queue value, and finally found that when the queue value is 0.75 can better balance the accuracy and completeness of entity links. Based on this, similarity less than or equal to 0.75 is considered as a new instance in the KG. Fig. 6 shows a specific example of entity linking.

3.3.3. Dynamic updating of GDT-oriented KG
In order to reduce the repetitiveness of the GDT-oriented KG, the updating method was set to two types: add new nodes and replace old nodes. We determined whether the entity extracted by LLM is a new instance based on the entity links in the previous section. If it is a new instance, we search for other nodes with which it has a relationship, add it around the other nodes, and supplement the relationship. If it is not a new instance, we replace it with the original node, then judge whether a new relationship exists and supplement it if there exists a new relationship. The specific flow of LLM-driven dynamic updating of KG is shown in Fig. 7.

Our dynamic updating method relies on LLM to automate the construction or modification of KG nodes, and users can manually input

<img>Diagram showing an ontology-guided LLM prompt template. On the left, a blue box labeled "Few shot template" lists four steps: 1. Input text {input}, 2. Extract geographic entities {entities}, 3. Attach labels {labels} to entities based on ontology concepts, 4. Extract the relationships {relationships} between entities. An arrow points from this box to a green box labeled "Ontology," which has a "knowledge guide" arrow pointing to it. Another arrow points from the "Ontology" box to a blue box labeled "System prompt template," which lists four steps: 1. Role and objective, 2. Labeling nodes (Consistency, Node IDs, Relationships), 3. Coreference resolution, 4. Strict compliance. On the right, a large orange box contains the code for a default prompt: default_prompt = ChatPromptTemplate.from_messages([few_shot_template, ("system", system prompt,), ("human", "Tip: Make sure to answer in the correct format and do " "not include any explanations." "Use the given format to extract information from the " "following input: {input}" ), )]).</img> Fig. 5. Ontology-guided LLM prompt template.

<page_number>5</page_number>

Page 6
J. Zhang et al. International Journal of Applied Earth Observation and Geoinformation 139 (2025) 104527

<img>Fig. 6. KG-enhanced LLM entity linking algorithm.</img>

<img>Fig. 7. LLM-driven dynamic updating of KG.</img>

natural language text or upload PDF files to realize dynamic updating of the KG. It makes full use of LLM’s ability to understand natural language and breaks through the bottleneck of traditional KGs that need to be manually constructed and updated by experts, which significantly reduces the difficulty of constructing KGs and improves the efficiency of updating KGs.

3.4. Intelligent Q&A for KG integrating LLM
In order to further improve the efficiency of communication between users and KG and reduce the difficulty of using KG, we developed a KG intelligent Q&A system based on LLM. First, we used LLM to extract the geographic entities and relationships in the user’s question and automatically construct a KG query statement for the nodes and relationships involved. Second, based on the user question and the KG query results, we utilized LLM’s knowledge reasoning capability to extract the answers from the retrieved nodes and relationships. Finally, with the help of LLM, we converted the answers into fluent natural language text and returned them to the user.

The intelligent KG integrating LLM offers two key advantages. From the user’s perspective, the necessity to master a complex knowledge base query language is eliminated. Instead, direct communication with the LLM through natural language is sufficient to complete operations within the KG, including the addition, change, and query of knowledge. Furthermore, LLM augments the KG’s capacity for reasoning. In addition to the fundamental operations characteristic of conventional KGs, intelligent KG is capable of providing personalized summaries and recommendations tailored to the specific requirements of users.

4. Experimental analysis
4.1. Study case description
An earthquake is a typical and common natural geographic phenomenon involving interrelated changes in multiple geographic events, geographic objects, and geographic states. As such, it provides an ideal case study for demonstrating the capability and potential of KGs in processing complex geospatial information (Jiao and You 2023). Accordingly, the Jishishan earthquake, which occurred on December 18, 2023, in Gansu Province, China, is employed as a case study to construct a KG and conduct experimental analysis.

4.2. Prototype system for intelligent KG
We developed the intelligent KG system using Python 3.12.1 as the programming language, Langchain 0.2.6 as the application development framework for the LLM, Streamlit 1.28.2 as the web development framework, and Neo4j 4.4.20 as the graph database. For the LLM, we selected GPT-4o open-source model as the dialogue model and utilized the function provided by OpenAI to invoke ChatGPT 4o. The development environment of the prototype system in this paper is shown in Table 1.

The interface of the prototype system is shown in Fig. 8. The system comprises two primary functions: KG update and query. The update function enables users to utilize PDF documents or input text, and the system will automatically identify the geographic entities in the documents. It allows for the synchronous updating of nodes and relationships in the Neo4j graph database in real-time. The query function allows users to interact with the KG through natural language, eliminating the necessity for users to learn the specific Cypher query syntax of Neo4j in order to access the nodes and relationships in the KG quickly.

Table 1
Development environment information.
Equipment	Environmental configuration	Detailed information
Hardware	CPU	AMD Ryzen 7 5800H
RAM	32 GB
GPU	NVIDIA GeForce RTX 3060
Video memory	16 GB
Software	Operating system	Windows 11
Software	Python 3.12.1
<page_number>6</page_number>

Page 7
J. Zhang et al.

<img>Prototype system interface</img> Fig. 8. Prototype system interface.

4.3. Gdt-oriented KG representation ability analysis

4.3.1. Gdt-oriented KG construction result and analysis We combed the geographic entities related to this event based on the Wikipedia entry for the 2023 Jishishan earthquake. Subsequently, the GDT ontology was employed as a conceptual template, resulting in the formation and storage of a total of 133 nodes and 259 relations with the Neo4j graph database. The visualization results are presented in Fig. 9. As illustrated in the figure, GDT-oriented KG effectively links the geographic events, geographic objects, and geographic states associated with the Jishishan earthquake. Moreover, the KG encompasses numerous virtual geographic entities, the sources, formats, and applications of which are explicitly documented within the graph database. This approach demonstrates the interaction between PGE and VGE in GDT, facilitating the management of virtual geographic entities.

4.3.2. Comparison of knowledge representation ability The International Geographical Union (IGU) states that the essence of geography is to answer six fundamental geographical questions: “Where is it? When did it happen? What does it look like? Why is it there? What role does it play? How can it be made to benefit humans and the natural environment (IGU-CGE, 2016)?” Geographic KGs, as a new type of geographic knowledge storage structure, need to have the ability to answer these six questions. In this context, we compared GDT-oriented KG with other geographic KGs (Li et al. 2020; Zhu et al. 2024a), and evaluated the KG’s representation ability by comparing the extent to which it answered the six fundamental questions of geography. We randomly selected 10 geographic entities from each of the three KGs to find out whether the answer exists in the corresponding node in

International Journal of Applied Earth Observation and Geoinformation 139 (2025) 104527

the KG based on the six questions of geography. If it exists, the score will be added by one, and if it doesn’t exist, no score will be given. The scoring results of the three KGs are shown in Table 2, and the complete statistical results are shown in Material 1.

From the table, our GDT-oriented KG can reflect the space, time, state, evolution process and interrelationships of geographic entities more comprehensively than the other KGs. In particular, it can be seen from Q3 and Q4 that GDT-oriented KG has more state and evolution information on geographic entities compared to the other two KGs. This is due to the fact that our GDT-oriented KG method provides a comprehensive representation of the interrelationships among geographic events, geographic objects, and geographic states. In addition, in the evaluation of Q5 and Q6 questions, we found that due to the existence of many virtual geographic entity nodes and relationships in GDT-oriented KG, which makes GDT-oriented KG better reflects the virtual and real interactions of geographic objects compared to the other two KGs, which is an essential difference between GDT-oriented KG and the other KGs. Finally, in Q5 and Q6, our score is not as good as Zhu et al. 2024a’s score, which is because their KG is specifically constructed around the needs of different users. Most of the entities are directly related to humans and can be used to help humans with disaster analysis. This result shows that GDT-oriented KG still has some room for addition compared to some domain KGs with explicit tasks.

4.4. Intelligence evaluation of KG driven by LLM

To explore whether the proposed method improves the KG’s intelligence, we evaluated the system’s knowledge updating and knowledge querying capabilities using the KG constructed in Section 4.3 as a benchmark dataset.

4.4.1. Evaluation of knowledge updating ability (1) Updated visualization result. In the context of natural disasters, there has been a notable increase in the utilization of social media platforms for sharing emergency

Table 2 Results of scores for different KG representation abilities.

Question	Group	Total score
Q1: Is there location information for this geographic entity? (Space)	Ours	9
Li et al. 2020	7
Zhu et al. 2024a	8
Q2: Is there temporal information associated with this geographic entity? (Time)	Ours	10
Li et al. 2020	4
Zhu et al. 2024a	7
Q3: Is there state information for this geographic entity? (State)	Ours	10
Li et al. 2020	9
Zhu et al. 2024a	2
Q4: Is there evolutionary information about this geographic entity? (Evolutionary process)	Ours	10
Li et al. 2020	6
Zhu et al. 2024a	0
Q5: Are there other geographic entities that interact with this geographic entity? (Interrelationships)	Ours	8
Li et al. 2020	5
Zhu et al. 2024a	9
Q6: Is there information that this geographic entity benefits the human or natural environment? (Interrelationships)	Ours	7
Li et al. 2020	5
Zhu et al. 2024a	10
<img>GDT-oriented KG visualization result</img> Fig. 9. GDT-oriented KG visualization result.

<page_number>7</page_number>

Page 8
J. Zhang et al.

information (Hu et al. 2023). To assess the efficacy of the proposed method in this paper for KG updating, we randomly selected 10 text messages about the 2023 Jishishan earthquake from online sources, including social media, news reports, and government platforms. We then translated these text messages into English and input them sequentially into the intelligent KG system as experimental materials for GDT-oriented KG updating. The experimental materials are available as supplementary materials. Subsequently, the update result based on Material 2 in Neo4j was queried, and the “Victims” node was selected to demonstrate the update result, as illustrated in Fig. 10.

We used blue bolded arrows to indicate the relationship of updates to highlight the updated content better. From the figure, our approach supports dynamic updating and visual representation of the KG. The updated KG preserves the previously constructed nodes and relationships intact and effectively links the new nodes to the old ones. More importantly, each newly added node is labelled under the guidance of the GDT ontology and adopts a different colour in Neo4j for differentiation. For example, in this update, “civil rescue” is labelled as “human events”, and “armed police” is labelled as “real objects”. On the one hand, the ontology guidance can help the LLM extract geographic domain entities more accurately. On the other hand, it helps users understand the hierarchical categories of different geographic entities more intuitively.

(2) Efficiency of updates. We sorted the 10 textual materials selected in the previous section by the number of words and sequentially input them into the intelligent KG system for updating. Since the KG update is affected by network latency, number of concurrent users, etc., we recorded a total of 100 update times based on the 10 materials at 10 different times, and the results are shown in Fig. 11.

As illustrated in the figure, the update time of the KG based on 10 textual materials is less than 1 min, with an average update efficiency of only 33.05 s. The results demonstrate that our approach is capable of rapidly extracting geographic entities from pervasive textual data and transforming them into nodes and relationships in near real-time, thereby complementing and updating the KG. Furthermore, the entire process of updating the KG is fully automated by the system, thereby significantly improving both the efficiency and intelligence of the updating process. In addition, it was observed that the update time of the KG exhibited a positive correlation with the number of words in the updated material. As the number of words increased, the update time also increased. This is due to the fact that a token represents the basic unit of comprehension and processing for LLM, and the number of tokens is positively correlated with the number of English words.

(3) Quality of updates. To validate the effectiveness of the dynamic updating method, we designed a set of ablation experiments to quantify the updating performance of LLM in KG. Based on the 10 textual materials in the previous section, we updated KG without ontology guidance and KG enhancement, with ontology guidance and without KG enhancement, and with ontology guidance and KG enhancement (our method). Then, we

International Journal of Applied Earth Observation and Geoinformation 139 (2025) 104527

<img>Box plot showing update time (s) on the y-axis versus number of words on the x-axis. The x-axis has values 66, 88, 90, 97, 104, 139, 157, 160, 170, 191. The y-axis ranges from 10 to 60. The box plots show the median, interquartile range, and outliers for each number of words. The update time generally increases with the number of words.</img> Fig. 11. KG update time for different word numbers.

recorded the number of new nodes and relations added and judged the wrong nodes and relations by experts. The statistical results of the update experiments are shown in Table 3.

From Table 3, our method improves node accuracy by 40.5 % and relationship accuracy by 39.1 % compared to the original LLM knowledge extraction method. This indicates that ontology guidance and KG enhancement can substantially improve the accuracy of LLM for entity and relation extraction.

In addition, to further assess the quality of knowledge graph updates, we categorized the updating methods into four groups, i.e., manual updating by experts (Group A), updating without ontology guidance and KG enhancement (Group B), updating with ontology guidance and without KG enhancement (Group C), and updating with ontology guidance and KG enhancement (our method, Group D). Each of the four approaches updated the KG based on the 10 textual materials in the previous section, where the experts in Group A consisted of the authors who participated in the construction of this knowledge graph. Then, we invited 5 experts in GIS who are well-versed in KGs to assess the quality of the updates to the KGs, all of whom have doctoral degrees. The experts scored the results of each update on a 5-point Likert scale in terms of accuracy, consistency, completeness, and redundancy, with higher scores representing better performance. The results of the expert evaluation are shown in Fig. 12.

In terms of accuracy, Group B (M = 2.00, SD = 0.78) is much lower than the other three groups, while Group C (M = 4.16, SD = 0.74) and Group D (M = 4.44, SD = 0.64) are not much different from Group A (M = 4.58, SD = 0.67). It indicates that the accuracy of knowledge extraction from LLM has an essential relationship with prompts. Specifically, LLM that employs geographic ontology-guided prompts

Experiment Condition	Number of new nodes	Number of new relationships	Node accuracy	Relationship accuracy
Without ontology guidance and KG enhancement	131	114	0.526	0.473
With ontology guidance and without KG enhancement	138	129	0.775	0.744
With ontology guidance and KG enhancement	117	103	0.931	0.864
Table 3 Comparison results of knowledge extraction.
<img>Two diagrams side-by-side. The left diagram, labeled (a) Before update, shows a knowledge graph with nodes for Earthquake, Mudslides, Victims, Virtual Person Information, and Real Objects, connected by arrows labeled trigger, cause, represent, and has. The right diagram, labeled (b) After update, shows the same graph with additional nodes for Firefighters, Song Yang, Thick Sky Rescue Team, Medical Forces, Civil Rescue, and Armed Police, connected by arrows labeled RESCUE, COORDINATE RESCUE, MEMBER OF, and has.</img> Fig. 10. Visualization result of KG updates.

<page_number>8</page_number>

Page 9
J. Zhang et al.

<img>Box plot showing evaluation results for four groups (A, B, C, D) across four indicators: Accuracy, Consistency, Completeness, and Redundancy. Group A is represented by a patterned box, Group B by a cross-hatched box, Group C by a solid box, and Group D by an empty box. The y-axis is labeled "Score" and ranges from 0 to 6.</img> Fig. 12. Evaluation results of the updated quality.

demonstrates enhanced accuracy in the extraction of geographic entities and relationships within textual data, thereby facilitating more precise updates to the KG.

In terms of consistency, the scores of Group B (M = 2.12, SD = 0.87), Group C (M = 3.42, SD = 1.25), and Group D (M = 4.64, SD = 0.56) increased sequentially, with Group D’s score only slightly lower than that of Group A (M = 4.72, SD = 0.50). On the one hand, this is due to the fact that in the prompt template guided by the ontology, we added the requirement of consistency of KG nodes and relationships, and the entity extraction process strictly adhered to the concepts in the ontology. On the other hand, the KG-enhanced entity linking method associates entity names in the text with node names in the KG, which further enhances node consistency.

In terms of completeness, Group B (M = 1.92, SD = 0.75) is much lower than the other three groups, while Group C (M = 3.90, SD = 1.06) and Group D (M = 4.14, SD = 0.83) are also somewhat different from Group A (M = 4.62, SD = 0.64). It indicates that although the proposed method can improve the completeness of knowledge extraction of LLM by ontology-guided prompts and KG enhancement in a substantial way, it still cannot reach the level of expert manual extraction at present.

In terms of redundancy, the scores of Group B (M = 2.62, SD = 1.23), Group C (M = 3.36, SD = 1.37) and Group D (M = 4.84, SD = 0.37) increase in order, with the score of Group D even slightly higher than that of Group A (M = 4.76, SD = 0.43). It suggests that ontology guidance can effectively reduce the repetition of entity extraction, thus reducing the redundancy of KG updates. Furthermore, the fact that Group A scores higher than Group D illustrates that the KG-enhanced entity linking method can effectively clean and disambiguate the entities extracted from LLM, which makes our update method better than expert manual update in terms of redundancy.

In conclusion, the proposed method demonstrates the capacity to enhance the accuracy, consistency, completeness and redundancy of LLM-driven KG updates through the utilization of ontology guidance and KG enhancement. The quality of these updates is found to be on par with or even superior to that of the expert manual updating method in terms of accuracy, consistency, and redundancy. Nevertheless, there is still scope for enhancement in terms of completeness in comparison to expert manual updating due to the current limitations of the LLM capability inherent to our method. However, it is noteworthy that our method exhibits a superior degree of automation and intelligence compared to expert manual updating, which represents a significant contribution to this paper.

4.4.2. Evaluation of knowledge querying ability Querying entity nodes and relationships is one of the most commonly used functions of KGs. Therefore, we prepared some questions related to the content of GDT-oriented KG, asked questions to the intelligent KG and recorded the answer results and time. The sample questions and results are shown in Fig. 13 and Table 4. Among them, Q1 and Q2 are used to verify whether the system has the KG node and relationship query function; Q3 ~ Q6 are used to explore the knowledge reasoning capability of the system; Q7 ~ Q9 verify that the knowledge used to answer natural language queries are all from KG by asking questions about the knowledge that does not belong to KG. In addition, we chose the F1-Score of ROUGE-1 and ROUGE-L as the natural language query answering quality assessment metrics (Srivastava and Memon, 2024). This is because ROUGE-1 focuses on word-level accuracy and is able to assess whether the system accurately extracts and generates key information. ROUGE-L measures the longest common subsequence match between the generated answer and the reference answer and is able to reflect the structure and contextual coherence of the generated answer. The F1-Score balances the relationship between Precision and Recall and is able to evaluate the performance of answer results between accuracy and completeness.

(1) Query results analysis. In terms of knowledge query and reasoning functions, Fig. 13 Shows the remarkable intelligence of our KG, which enables seamless communication with users through the adoption of natural language. Furthermore, the responses in Fig. 13 and Table 4 illustrate that our KG exhibits certain knowledge reasoning and summarization capabilities that are not present in traditional KGs. First, the answers to Q1 and Q2 demonstrate that our KG is capable of querying nodes and relations with the same degree of accuracy as other traditional KGs. Then, Fig. 13 and the answers indicate that our KG is capable of answering relatively straightforward questions and presenting the results in a clear, precise, and readily understandable natural language format. However, the system is unable to provide an answer for Q6, indicating that our KG has limited knowledge reasoning ability and is currently unable to answer questions that require multi-layer relational reasoning to obtain an answer.

In terms of the quality of natural language generation, when the system queried the answers (Q1 ~ Q5), the average F1-Score of ROUGE-1 reached 0.948, and that of ROUGE-L reached 0.852. It indicates that the system-generated answers basically accurately covered all the key information, and had good logical order and contextual coherence.

In terms of the reliability of the answer results, the ablation results of Q7 ~ Q9 demonstrate that the knowledge used by our intelligent Q&A system for answering is not part of the pre-training data of the LLM. It will answer “I don’t know the answer.” for any knowledge that does not exist in the KG, even if it is a very basic question. In addition, by comparing the results of Q3 and Q9, it can be seen that our intelligent Q&A system can accurately recognize whether the answer to a question can be found in KG or not. There is only one-word difference between Q3 and Q9, which is “this” and “Wenchuan,” but the answers of both of them are different. It further proves the reliability of the knowledge used by our system to answer natural language queries.

(2) Query efficiency analysis. From the table, the response times of our intelligent KG answers are all less than 10 s, and the average response time is only 6.55 s, which indicates that our approach allows users to acquire knowledge from the KG quickly. More importantly, users do not need to master the complex

International Journal of Applied Earth Observation and Geoinformation 139 (2025) 104527

Knowledge graph Q&A function

<img>Chat interface showing a conversation with an intelligent knowledge graph assistant. The user asks "Hi, I'm your intelligent knowledge graph assistant, how can I help you?" and "Could you summarize this knowledge graph?". The assistant replies with information about the knowledge graph's structure.</img> Fig. 13. Example of an intelligent KG query.

<page_number>9</page_number>

Page 10
J. Zhang et al. International Journal of Applied Earth Observation and Geoinformation 139 (2025) 104527

Table 4 KG intelligent Q&A results.

Questions	Generated answers	Reference answers	ROUGE-1 F1-Score	ROUGE-L F1-Score	Time (s)
Q1: Please list all nodes labeled as location.	GA1: Gansu Province, Jishishan County, Lanzhou City, Liugou Township, Qingyang City, Pingliang City, Tianshui City, Longnan City, Dingxi City, Wuwei City.	RA1: Gansu Province, Lanzhou City, Qingyang City, Pingliang City, Longnan City, Tianshui City, Dingxi City, Wuwei City, Jishishan County, Liugou Township.	1.0	0.7	6
Q2: What relationship exists between Virtual Rescue Route and Emergency Department?	GA2: The relationship between Virtual Rescue Route and Emergency Department is that of a guide.	RA2: The relationship between Virtual Rescue Route and Emergency Department is “guide”.	0.88	0.88	5
Q3: What damage did this Earthquake cause?	GA3: The earthquake caused damage to facilities, roads, houses (generally damaged, severely damaged, and collapsed), and resulted in victims, dead people, injured people, and affected people.	RA3: The earthquake caused damage to facilities, roads, houses, and resulted in affected people, injured people, dead people, and victims.	0.86	0.68	7
Q4: Who was involved in rescuing the victims?	GA4: Civil Rescue was involved in rescuing the victims.	RA4: Civil Rescue was involved in rescuing the victims.	1	1	5
Q5: Where did this Earthquake occur?	GA5: The earthquake occurred in Liugou Township, Jishishan County, Gansu Province.	RA5: The earthquake occurred in Liugou Township, Jishishan County, Gansu Province.	1	1	6
Q6: How did the emergency department rescue injured people in this earthquake?	GA6: I don’t know the answer.	RA6: Emergency department rescued the injured by taking measures.	0.14	0.14	6
Q7: Who are you?	GA7: I don’t know the answer.	RA7: I don’t know the answer.	1	1	8
Q8: Where is Sichuan?	GA8: I don’t know the answer.	RA8: I don’t know the answer.	1	1	7
Q9: Where did the Wenchuan Earthquake occur?	GA9: I don’t know the answer.	RA9: I don’t know the answer.	1	1	9
Cypher query syntax to communicate with KGs, and our approach dramatically reduces the need for users’ specialized backgrounds, thus improving the efficiency of the general public in communicating with KGs.

Discussion
5.1. Strengths of the proposed method

The development of GIS needs to go hand in hand with new information technologies and actively integrate GIS into mainstream information technologies (Lü et al. 2018). In this context, we innovatively introduce LLM to construct and update geographic KG to provide dynamic knowledge support for GDT. This is a great practical contribution to breaking down the professional barriers of KGs, thereby improving the ability of multi-domain co-construction of geographic knowledge. Specifically, the method in this paper has two levels of advantages over traditional geographic KGs.

In terms of knowledge representation, we established a GDT-oriented KG with three domains of “event-object-state”, which describes the evolution of geographic objects and states driven by geographic events more clearly than the traditional geographic KGs (Lai et al. 2023; Zhu et al. 2024a). More importantly, compared with other geographic KGs, we emphasize the importance of virtual geographic entities for modern GIS. We thoroughly describe the association relationship between virtual geographic objects and real geographic objects, effectively revealing the interaction process between PGE and VGE (Wang et al. 2019; Zheng et al. 2022). Display representations of geographic object interaction processes can help researchers to more accurately simulate real-world geographic phenomena in virtual environments and provide richer semantic support for geographic scene modeling and visualization.

In terms of intelligence, we are driven by LLM and use natural language to complete the KG update and query process. Our approach is not dominated by domain experts and does not require users to have any background in graph databases, which overcomes the problems of difficult updating and communication of traditional KGs (Li et al. 2020; Zhu et al. 2024a,c). What’s more, we have greatly improved the intelligence and automation of KG construction under the premise of guaranteeing the quality of KG updates, which well supports the demand of GDT for real-time knowledge. This easy-to-construct, update, and communicate form of geographic knowledge representation expands the application areas of traditional knowledge graphs, providing a more efficient tool for tasks such as knowledge-guided phenomenon simulation, modeling, and visualization.

5.2. Applicability and potential

Natural language, as the first language of geography, has significant advantages over other geographic languages in terms of data richness, cognitive habitus, and popularity of applications (Delboni et al., 2007; Stock et al. 2022). In this context, we leverage the superior natural language processing capabilities of LLM to allow users to quickly and accurately extract geographic entities from ubiquitous textual data for KG updates. It enhances the utilization of web-based open-source data such as social media and can effectively enrich the coverage of geographic KGs. More importantly, for the GIS field, our approach can alleviate the challenge of dynamic geographic knowledge brought by the rapid update of information in the Internet era, and the natural advantage of natural language allows our KG to allow multi-user cross-disciplinary knowledge co-construction, which can continuously feed the GDTs with the latest knowledge and data.

Moreover, our approach can also give some insights and inspiration to the construction of KGs in other domains. Researchers from other disciplines may utilize our research ideas to inform the construction of specialized domain ontologies, thereby facilitating the development of more intelligent KGs in other domains. It is worth mentioning that with the continuous development of LLMs, the updating and query quality of KGs will be further improved.

5.3. Limitations and future works

This study still has some shortcomings. At first, the results of the update quality evaluation in 4.4.1 show that there are still gaps in the completeness of our KG in terms of knowledge extraction compared to the manual update by experts. In the future, large-scale pre-trained models (e.g., GPT, Claude, etc.) will serve as the foundation for fine-tuning the geographic entity extraction process, utilizing labelled geographic data to improve the accuracy and completeness of the KG updates.

<page_number>10</page_number>

Page 11
J. Zhang et al.

Second, when there is entity ambiguity (i.e., multiple entities sharing the same name), our method may add the new entity to the wrong position in the KG. In the future, we will build additional inference mechanisms to verify the accuracy of the relationship between the added nodes and the existing nodes to ensure the accuracy of KG updates.

Finally, the query results of 4.4.2 show that our intelligent KG reasoning ability still needs to be improved, and the results of answering complex tasks are not satisfactory. In the future, we will introduce deep learning models to improve the reasoning algorithms further in order to enhance the ability of the KG to answer complex questions.

6. Conclusion
With the continuous development of VGE and the emergence of emerging concepts such as GDTs, the GIS discipline has increased requirements for knowledge timeliness (Lin and Chen 2015; Zhang et al. 2024a). In such a context, this paper innovatively combines the respective advantages of LLMs and KGs to provide a new paradigm to support the construction of knowledge dynamics oriented to GDTs.

The main contributions of this paper are twofold. First, we proposed a three-domain-associated GDT ontology and KG construction method, which enhances the representation ability of geographic KG for virtual geographic objects. Second, we established an LLM-driven algorithm for dynamic updating and intelligent querying of KG, with an updating efficiency of less than 1 min, an updating quality comparable to that of manual updating by experts, and an average query time of 6.55 s. Compared with the traditional geographic KGs, on the one hand, we endow the KG with the ability of dynamic updating, which better supports the knowledge construction under the idea of GDT. On the other hand, we allow users to use natural language to communicate with the intelligent KG, and such an interaction mode is conducive to shortening the distance between users and the KG, providing a better possibility for geographic knowledge co-construction.

However, as described in Section 5.3, the proposed method still needs to improve in terms of the completeness of knowledge updates and the ability to reason about knowledge for complex problems. In the future, we will fine-tune the LLM and optimize the knowledge reasoning algorithm to support geographic knowledge infrastructure development better.

CRediT authorship contribution statement
Jinbin Zhang: Writing – original draft, Software, Resources, Methodology, Formal analysis, Data curation, Conceptualization. Jun Zhu: Writing – review & editing, Validation, Supervision, Funding acquisition, Conceptualization. Zhihao Guo: Supervision, Software. Jianlin Wu: Supervision, Resources, Formal analysis. Yukun Guo: Resources, Formal analysis. Jianbo Lai: Resources, Formal analysis. Weilian Li: Writing – review & editing, Visualization.

Declaration of competing interest
The authors declare that they have no known competing financial interests or personal relationships that could have appeared to influence the work reported in this paper.

Acknowledgments
This paper was supported by the National Natural Science Foundation of China [Grant Nos. 42171397 and 42271424], Open Project Fund of National Engineering Research Center of Digital Construction and Evaluation Technology of Urban Rail Transit [No. 2024sys015], Open Project Fund of National Key Laboratory of Intelligent Parallel Technology [No. SHJJ2024013].

International Journal of Applied Earth Observation and Geoinformation 139 (2025) 104527

Appendix A. Supplementary data
Supplementary data to this article can be found online at https://doi.org/10.1016/j.jag.2025.104527.

Data availability
I have shared the link to my data/code at the Attach File step

References
Andrus, B. R., Nasiri, Y., Cui, S., Cullen, B., & Fulda, N. (2022, June). Enhanced story comprehension for large language models through dynamic document-based knowledge graphs. In Proceedings of the AAAI Conference on Artificial Intelligence (Vol. 36, No. 10, pp. 10436-10444).

Dagdelen, J., Dunn, A., Lee, S., Walker, N., Rosen, A.S., Ceder, G., Jain, A., 2024. Structured information extraction from scientific text with large language models. Nature Communications 15 (1), 1418.

Delboni, T.M., Borges, K.A., Laender, A.H., Davis Jr, C.A., 2007. Semantic expansion of geographic web queries based on natural language positioning expressions. Transactions in GIS 11 (3), 377-397.

Ding, Y., Xu, Z., Zhu, Q., Li, H., Luo, Y., Bao, Y., Zeng, S., 2022. Integrated data-model-knowledge representation for natural resource entities. International Journal of Digital Earth 15 (1), 653-678.

Döllner, J., 2020. Geospatial artificial intelligence: potentials of machine learning for 3D point clouds and geospatial digital twins. PFG–Journal of Photogrammetry. Remote Sensing and Geoinformation Science 88, 15–24.

Fan, R., Wang, L., Yan, J., Song, W., Zhu, Y., Chen, X., 2019. Deep learning-based named entity recognition and knowledge graph construction for geological hazards. ISPRS International Journal of Geo-Information 9 (1), 15.

Fensel, D., Şimşek, U., Angele, K., Huaman, E., Kärle, E., Panasiuk, O., Wahler, A., 2020. Introduction: what is a knowledge graph? Methodology, tools and selected use cases, Knowledge graphs, pp. 1–10.

Golledge, R.G., 2002. The nature of geographic knowledge. Annals of the Association of American Geographers 92 (1), 1–14.

Guo, Q., Cao, S., Yi, Z., 2022. A medical question answering system using large language models and knowledge graphs. International Journal of Intelligent Systems 37 (11), 8548–8564.

Hu, Y., Mai, G., Cundy, C., Choi, K., Lao, N., Liu, W., Joseph, K., 2023. Geo-knowledge-guided GPT models improve the extraction of location descriptions from disaster-related social media messages. International Journal of Geographical Information Science 37 (11), 2289–2318.

Igu-cge., 2016. 2016 International Charter on geographical education. IGU-CGE.

Jiao, Y., You, S., 2023. Rescue decision via earthquake disaster knowledge graph reasoning. Multimedia Systems 29 (2), 605–614.

Kefalidis, S.A., Punjani, D., Tsalapati, E., Plas, K., Pollali, M.A., Maret, P., Koubarakis, M., 2024. The question answering system GeoQA2 and a new benchmark for its evaluation. International Journal of Applied Earth Observation and Geoinformation 134, 104203.

Lai, J., Zhu, J., Guo, Y., You, J., Xie, Y., Wu, J., Hu, Y., 2023. Dynamic data-driven railway bridge construction knowledge graph update method. Transactions in GIS 27 (7), 2099–2117.

Li, H., Zhang, C., Xiao, Z., Chen, M., Lu, D., Liu, S., 2021a. A Web-based geo-simulation approach integrating knowledge graph and model-services. Environmental Modelling & Software, 144, 105160.

Li, W., Zhu, J., Zhang, Y., Fu, L., Gong, Y., Hu, Y., & Cao, Y. (2020). An on-demand construction method of disaster scenes for multilevel users. Natural Hazards 101, 409–428.

Li, W., Zhu, J., Fu, L., Zhu, Q., Xie, Y., Hu, Y., 2021b. An augmented representation method of debris flow scenes to improve public perception. International Journal of Geographical Information Science 35 (8), 1521–1544.

Li, W., Haunert, J.H., Forsch, A., Zhu, J., Zhu, Q., Dehbi, Y., 2024b. Informed sampling and recommendation of cycling routes: leveraging crowd-sourced trajectories with weighted-latent Dirichlet allocation. International Journal of Geographical Information Science 1–22.

Li, W., Zhu, J., Zhu, Q., Zhang, J., Han, X., Dehbi, Y., 2024a. Visual attention-guided augmented representation of geographic scenes: a case of bridge stress visualization. International Journal of Geographical Information Science 1–23.

Lin, H., Chen, M., 2015. Managing and sharing geographic knowledge in virtual geographic environments (VGEs). Annals of GIS 21 (4), 261–263.

Lin, H., Chen, M., Lu, G., Zhu, Q., Gong, J., You, X., Hu, M., 2013. Virtual geographic environments (VGEs): A new generation of geographic analysis tool. Earth-Science Reviews 126, 74–84.

Lin, H., Xu, B., Chen, Y., Jing, Q., You, L., 2022. The virtual geographic environments: More than the digital twin of the physical geographical environments. In: New Thinking in GIScience. Singapore, Springer Nature Singapore, pp. 17–28.

Lü, G., Chen, M., Yuan, L., Zhou, L., Wen, Y., Wu, M., Sheng, Y., 2018. Geographic scenario: A possible foundation for further development of virtual geographic environments. International Journal of Digital Earth 11 (4), 356–368.

Maude, A., 2016. What might powerful geographical knowledge look like? Geography 101 (2), 70–76.

Pan, S., Luo, L., Wang, Y., Chen, C., Wang, J., Wu, X., 2024. Unifying large language models and knowledge graphs: A roadmap. IEEE Transactions on Knowledge and Data Engineering.

<page_number>11</page_number>

Page 12
J. Zhang et al.

Shi, J.S., et al., 2019. Simulation and expression of radioactive pollutant dispersion process based on 3D grid. Journal of Spatio-Temporal Information 26 (2), 52–59. Song, D., Luo, Y., Heflin, J., 2016. Linking heterogeneous data in the semantic web using scalable and domain-independent candidate selection. IEEE Transactions on Knowledge and Data Engineering 29 (1), 143–156. Srivastava, A., Memon, A., 2024. Towards Robust Evaluation: A Comprehensive Taxonomy of Datasets and Metrics for Open Domain Question Answering in the Era of Large Language Models. IEEE Access. Stock, K., Jones, C.B., Russell, S., Radke, M., Das, P., Aflaki, N., 2022. Detecting geospatial location descriptions in natural language text. International Journal of Geographical Information Science 36 (3), 547–584. Sun, K., Hu, Y., Song, J., Zhu, Y., 2021. Aligning geographic entities from historical maps for building knowledge graphs. International Journal of Geographical Information Science 35 (10), 2078–2107. Tang, R., Zhu, J., Ren, Y., Ding, Y., Wu, J., Guo, Y., Xie, Y., 2023. A Knowledge-Guided Fusion Visualisation Method of Digital Twin Scenes for Mountain Highways. ISPRS International Journal of Geo-Information 12 (10), 424. Tao, L., Xie, Z., Xu, D., Ma, K., Qiu, Q., Pan, S., Huang, B., 2022. Geographic named entity recognition by employing natural language processing and an improved bert model. ISPRS International Journal of Geo-Information 11 (12), 598. Tasnim, M., et al., 2019. Summarizing entity temporal evolution in knowledge graphs. In: Companionproceedings of the 2019 World Wide Web conference, San Francisco, USA, 961–965. Wang, J., Li, G., Yu, J.X., Feng, J., 2011. Entity matching: How similar is similar. Proceedings of the VLDB Endowment 4 (10), 622–633. Wang, S., Hu, T., Xiao, H., Li, Y., Zhang, C., Ning, H., Ye, X., 2024. GPT, large language models (LLMs) and generative artificial intelligence (GAI) models in geospatial science: a systematic review. International Journal of Digital Earth 17 (1), 2353122. Wang, S., Zhang, X., Ye, P., Du, M., Lu, Y., Xue, H., 2019. Geographic knowledge graph (GeoKG): A formalized geographic knowledge representation. ISPRS International Journal of Geo-Information 8 (4), 184. Wu, J., Zhu, J., Zhang, J., Dang, P., Li, W., Guo, Y., Liang, C., 2023. A dynamic holographic modelling method of digital twin scenes for bridge construction. International Journal of Digital Earth 16 (1), 2404–2425. Yuan, M., 2022. From representation to geocomputation: some theoretical accounts of geographic information science. In: New Thinking in GIScience. Singapore, Springer Nature Singapore, pp. 1–8.

International Journal of Applied Earth Observation and Geoinformation 139 (2025) 104527

Zhang, J., Zhu, J., Dang, P., Wu, J., Zhou, Y., Li, W., You, J., 2023. An improved social force model (ISFM)-based crowd evacuation simulation method in virtual reality with a subway fire as a case study. International Journal of Digital Earth 16 (1), 1186–1204. Zhang, J., Zhu, J., Zhou, Y., Zhu, Q., Wu, J., Guo, Y., Zhang, H., 2024a. Exploring geospatial digital twins: a novel panorama-based method with enhanced representation of virtual geographic scenes in Virtual Reality (VR). International Journal of Geographical Information Science 1–24. Zhang, Y., Chen, W., Huang, B., Zhang, Z., Li, J., Gao, R., Hu, C., 2024b. An event logic graph for geographic environment observation planning in disaster chain monitoring. International Journal of Applied Earth Observation and Geoinformation 134, 104220. Zheng, K., Xie, M.H., Zhang, J.B., Xie, J., Xia, S.H., 2022. A knowledge representation model based on the geographic spatiotemporal process. International Journal of Geographical Information Science 36 (4), 674–691. Zheng, M., Jin, M., Guo, F., 2013. Modeling and simulation of toxic gas dispersion in urban streets supported by GIS. Geomatics and Information Science of Wuhan University 38 (8), 935–939. Zhou, C., Li, Q., Li, C., Yu, J., Liu, Y., Wang, G., Sun, L., 2024. A comprehensive survey on pretrained foundation models: A history from bert to chatgpt. International Journal of Machine Learning and Cybernetics 1–65. Zhu, J., Dang, P., Zhang, J., Cao, Y., Wu, J., Li, W., You, J., 2024d. The impact of spatial scale on layout learning and individual evacuation behavior in indoor fires: single-scale learning perspectives. International Journal of Geographical Information Science 38 (1), 77–99. Zhu, J., Zhang, J., Zhu, Q., Li, W., Wu, J., Guo, Y., 2024a. A knowledge-guided visualization framework of disaster scenes for helping the public cognize risk information. International Journal of Geographical Information Science 1–28. Zhu, J., Dang, P., Cao, Y., Lai, J., Guo, Y., Wang, P., Li, W., 2024b. A flood knowledge-constrained large language model interactable with GIS: enhancing public risk perception of floods. International Journal of Geographical Information Science 38 (4), 603–625. Zhu, J., Zhang, J., Zhu, Q., Zuo, L., Liang, C., Chen, X., Xie, Y., 2024c. Virtual geographical scene twin modeling: a combined data-driven and knowledge-driven method with bridge construction as a case study. International Journal of Digital Earth 17 (1), 1–23.

<page_number>12</page_number>