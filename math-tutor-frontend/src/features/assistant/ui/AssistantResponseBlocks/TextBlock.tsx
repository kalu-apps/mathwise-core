import { Typography } from "@mui/material";

type TextBlockProps = {
  title?: string;
  text: string;
  tone?: "default" | "success" | "warning" | "error";
};

export function TextBlock({ title, text, tone = "default" }: TextBlockProps) {
  return (
    <article className={`assistant-block assistant-block--text assistant-block--${tone}`}>
      {title ? <Typography className="assistant-block__title">{title}</Typography> : null}
      <Typography className="assistant-block__text">{text}</Typography>
    </article>
  );
}
