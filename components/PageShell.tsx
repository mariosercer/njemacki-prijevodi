import Sidebar from "./Sidebar";

export default function PageShell({
  title,
  children,
  sidebar = true,
}: {
  title: string;
  children: React.ReactNode;
  sidebar?: boolean;
}) {
  return (
    <>
      <div className="title-bar">
        <div className="container">
          <h1>{title}</h1>
        </div>
      </div>
      <div className={`container page-body${sidebar ? " with-sidebar" : ""}`}>
        <article className="entry">{children}</article>
        {sidebar && <Sidebar />}
      </div>
    </>
  );
}
