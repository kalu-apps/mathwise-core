import { useState } from "react";
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  IconButton,
  Tooltip,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";
import { useNavigate } from "react-router-dom";
import { HeroSection } from "./sections/HeroSection";
import { BenefitsSection } from "./sections/BenefitsSection";
import { CoursesPreview } from "./sections/CoursesPreview";
import { CTASection } from "./sections/CTASection";
import { useAuth } from "@/features/auth/model/AuthContext";
import { api } from "@/shared/api/client";
import { clearClientStateForDevReset } from "@/shared/lib/devReset";
import { DialogTitleWithClose } from "@/shared/ui/DialogTitleWithClose";

export default function Home() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [resetting, setResetting] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  const handleDevReset = async () => {
    if (resetting) return;
    try {
      setResetting(true);
      await api.post("/dev/reset");
    } catch {
      // ignore request errors and still clear local client state
    } finally {
      logout();
      clearClientStateForDevReset();
      navigate("/", { replace: true });
      window.location.reload();
    }
  };

  return (
    <>
      <HeroSection />
      <BenefitsSection />
      <CoursesPreview />
      <CTASection />
      {import.meta.env.DEV && (
        <div className="home-dev-reset">
          <Tooltip title="Сбросить демо-данные">
            <span>
              <IconButton
                onClick={() => setConfirmResetOpen(true)}
                size="large"
                aria-label="Сбросить демо-данные"
                disabled={resetting}
              >
                {resetting ? (
                  <CircularProgress size={22} color="inherit" />
                ) : (
                  <RestartAltRoundedIcon />
                )}
              </IconButton>
            </span>
          </Tooltip>
        </div>
      )}
      <Dialog
        open={confirmResetOpen}
        onClose={() => !resetting && setConfirmResetOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitleWithClose
          title="Сбросить демо-данные?"
          onClose={() => {
            if (resetting) return;
            setConfirmResetOpen(false);
          }}
        />
        <DialogContent>
          Это действие очистит тестовые данные, текущую авторизацию и вернет приложение в исходное состояние.
        </DialogContent>
        <DialogActions
          sx={
            isMobile
              ? {
                  justifyContent: "space-between",
                  px: 2,
                  pb: 2,
                }
              : undefined
          }
        >
          <Button
            onClick={() => setConfirmResetOpen(false)}
            disabled={resetting}
            variant={isMobile ? "text" : "outlined"}
          >
            Отмена
          </Button>
          <Button
            onClick={() => void handleDevReset()}
            disabled={resetting}
            variant="contained"
            color="warning"
          >
            {resetting ? "Сбрасываем..." : "Сбросить"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
