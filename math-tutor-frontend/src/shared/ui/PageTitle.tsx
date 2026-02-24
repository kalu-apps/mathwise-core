type PageTitleProps = {
  title: string;
  className?: string;
};

export function PageTitle({ title, className }: PageTitleProps) {
  const classes = ["ui-page-title", "page-title", className]
    .filter(Boolean)
    .join(" ");
  return (
    <h1 className={classes}>
      {title}
      <span className="ui-page-title__underline page-title__underline"></span>
    </h1>
  );
}
