import { Pagination, Stack, Typography, useMediaQuery, useTheme } from "@mui/material";
import { t } from "@/shared/i18n";

type Props = {
  page: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (nextPage: number) => void;
};

export function ListPagination({
  page,
  totalItems,
  pageSize,
  onPageChange,
}: Props) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalItems <= pageSize) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalItems);

  return (
    <div className="ui-pagination">
      <Typography className="ui-pagination__meta">
        {isMobile
          ? t("pagination.mobileInfo", { page, totalPages })
          : t("pagination.desktopInfo", { from, to, total: totalItems })}
      </Typography>

      <Stack direction="row" alignItems="center" spacing={1}>
        <Pagination
          count={totalPages}
          page={page}
          onChange={(_, nextPage) => onPageChange(nextPage)}
          size={isMobile ? "small" : "medium"}
          shape="rounded"
          color="primary"
          showFirstButton={!isMobile}
          showLastButton={!isMobile}
          siblingCount={isMobile ? 0 : 1}
          boundaryCount={isMobile ? 1 : 2}
        />
      </Stack>
    </div>
  );
}
