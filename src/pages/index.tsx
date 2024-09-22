import { useState } from "react";

const decompressZip = async (arrayBuffer: ArrayBuffer) => {
  async function decompressData(compressedData: ArrayBuffer) {
    const reader = new Blob([compressedData])
      .stream()
      .pipeThrough(new DecompressionStream("deflate-raw"))
      .getReader();
    const chunks: Uint8Array[] = [];
    let result = await reader.read();
    while (!result.done) {
      chunks.push(result.value);
      result = await reader.read();
    }
    return new Blob(chunks);
  }

  const dataView = new DataView(arrayBuffer);
  let offset = 0;
  const files: File[] = [];

  while (offset < dataView.byteLength) {
    const signature = dataView.getUint32(offset, true);
    if (signature !== 0x04034b50) break;
    const generalPurposeFlag = dataView.getUint16(offset + 6, true);
    const fileNameLength = dataView.getUint16(offset + 26, true);
    const extraFieldLength = dataView.getUint16(offset + 28, true);
    let compressedSize = dataView.getUint32(offset + 18, true);
    const pathName = new TextDecoder().decode(
      new Uint8Array(dataView.buffer, offset + 30, fileNameLength)
    );
    offset += fileNameLength + extraFieldLength + 30;
    const dataOffset = offset;
    const isDataDescriptor = (generalPurposeFlag & 0x0008) !== 0;

    if (isDataDescriptor) {
      while (offset < dataView.byteLength) {
        const potentialSignature = dataView.getUint32(offset, true);
        if (potentialSignature === 0x08074b50) {
          compressedSize = dataView.getUint32(offset + 8, true);
          offset += 16;
          break;
        }
        offset++;
      }
    } else {
      offset += compressedSize;
    }

    if (pathName[pathName.length - 1] !== "/") {
      const decompressedData = await decompressData(
        arrayBuffer.slice(dataOffset, dataOffset + compressedSize)
      );
      const fileName = pathName.replace(/.*\//, "");
      files.push(new File([decompressedData], fileName));
    }
  }
  return files;
};

const Page = () => {
  const [documents, setDocuments] = useState<[string, string][]>([]);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();

    const unCompressFiles = Array.from(e.dataTransfer.files).map(
      async (file) => {
        if (file.type === "application/x-zip-compressed") {
          return file.arrayBuffer().then(decompressZip);
        }
        return file;
      }
    );
    const files = Promise.all(unCompressFiles).then((files) => {
      return files.flat();
    });
    const documents = files.then(async (files) => {
      return Promise.all(
        files
          .filter((file) => file.name.match(/\.xml$|\.xsl$/))
          .map(async (file) => {
            const parser = new DOMParser();
            const xml = parser.parseFromString(
              await file.text(),
              "application/xml"
            );
            return [file.name, xml] as const;
          })
      );
    });
    documents.then((files) => {
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
