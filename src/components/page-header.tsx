type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: React.ReactNode;
};

/** In-page heading. On desktop the shell header already shows the title, so only the description shows there. */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    // With nothing but the title, the block would be empty on desktop — hide it there.
    <div className={`mb-section flex items-end justify-between gap-4 ${!description && !actions ? "md:hidden" : ""}`}>
      <div className="space-y-1">
        <h2 className="text-display md:sr-only">{title}</h2>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="hidden shrink-0 md:block">{actions}</div>}
    </div>
  );
}
