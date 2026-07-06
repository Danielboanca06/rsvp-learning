import { DocumentCard, type DocumentStat } from "./DocumentCard";

export function DocumentCarousel({ documents }: { documents: DocumentStat[] }) {
  return (
    <div className="scroll-fade-x flex gap-4 overflow-x-auto px-1 pb-2 [scroll-snap-type:x_mandatory]">
      {documents.map((document) => (
        <div
          key={document.id}
          className="w-[260px] shrink-0 transition-transform duration-200 ease-out hover:-translate-y-0.5 [scroll-snap-align:start]"
        >
          <DocumentCard document={document} />
        </div>
      ))}
    </div>
  );
}
