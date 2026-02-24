import { Button, Typography } from "@mui/material";
import type { AssistantEntityLink } from "@/shared/api/assistant-contracts";

type EntityLinksBlockProps = {
  title?: string;
  links: AssistantEntityLink[];
  onOpen: (link: AssistantEntityLink) => void;
};

export function EntityLinksBlock({ title, links, onOpen }: EntityLinksBlockProps) {
  return (
    <article className="assistant-block assistant-block--entity-links">
      {title ? <Typography className="assistant-block__title">{title}</Typography> : null}
      <div className="assistant-entity-links">
        {links.map((link) => (
          <Button
            key={link.id}
            className="assistant-entity-link"
            variant="text"
            onClick={() => onOpen(link)}
          >
            {link.label}
          </Button>
        ))}
      </div>
    </article>
  );
}
