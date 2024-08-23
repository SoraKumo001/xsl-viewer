import { useState } from "react";

const Page = () => {
  const [documents, setDocuments] = useState<[string, string][]>([]);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files)
      .filter((file) => file.name.match(/\.xml$|\.xsl$/))
      .map(async (file) => {
        const parser = new DOMParser();
        const xml = parser.parseFromString(
          await file.text(),
          "application/xml"
        );
        return [file.name, xml] as const;
      });
    Promise.all(files).then((files) => {
      const fileMap = Object.fromEntries(files);
      const xmlDocs = files.filter(([name]) => name.endsWith(".xml"));
      const documents = xmlDocs.map<[string, string]>(([name, xmlDoc]) => {
        const xsltProcessor = new XSLTProcessor();
        const styleNodes = Array.from(xmlDoc.childNodes).filter(
          (node) =>
            node.nodeType === Node.PROCESSING_INSTRUCTION_NODE &&
            (node as ProcessingInstruction).target === "xml-stylesheet"
        ) as ProcessingInstruction[];
        styleNodes.forEach((styleNode) => {
          const href = styleNode.data.match(/href="([^"]+)"/)[1];
          const xslDoc = fileMap[href];
          if (xslDoc) xsltProcessor.importStylesheet(xslDoc);
        });
        const resultDoc = xsltProcessor.transformToDocument(xmlDoc);
        const serializer = new XMLSerializer();
        const resultString = serializer.serializeToString(resultDoc);
        return [name, resultString];
      });
      setDocuments(documents);
    });
  };

  return (
    <div style={{ padding: "8px" }}>
      <div>
        <a href="https://github.com/SoraKumo001/xsl-viewer">Source code</a>
      </div>
      <div
        style={{
          height: "100px",
          width: "200px",
          border: "solid",
          marginBottom: "8px",
          padding: "8px",
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        Drop files here
      </div>
      <div>
        {documents.map(([name, content]) => (
          <div key={name}>
            <h2>{name}</h2>
            <div dangerouslySetInnerHTML={{ __html: content }} />
          </div>
        ))}
      </div>
    </div>
  );
};

export default Page;
