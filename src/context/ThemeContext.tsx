import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  // True only while we have no user-set preference and are following the OS
  const followingSystemRef = useRef(false);

  useEffect(() => {
    const darkModeQuery = window.matchMedia("(prefers-color-scheme: dark)");

    // 1. Read stored preference; fall back to system default on first launch
    chrome.storage.local.get(["theme"]).then((result) => {
      if (result.theme === "light" || result.theme === "dark") {
        setTheme(result.theme as Theme);
        followingSystemRef.current = false;
      } else {
        followingSystemRef.current = true;
        setTheme(darkModeQuery.matches ? "dark" : "light");
      }
    }).catch(() => {
      followingSystemRef.current = true;
      setTheme(darkModeQuery.matches ? "dark" : "light");
    });

    // 2. System preference listener — only applies when no user override is stored
    const handleSystemChange = (e: MediaQueryListEvent) => {
      if (followingSystemRef.current) setTheme(e.matches ? "dark" : "light");
    };
    darkModeQuery.addEventListener("change", handleSystemChange);

    // 3. Cross-context sync: popup toggle writes to storage → content scripts pick it up here
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.theme?.newValue === "light" || changes.theme?.newValue === "dark") {
        followingSystemRef.current = false;
        setTheme(changes.theme.newValue as Theme);
      }
    };
    chrome.storage.onChanged.addListener(handleStorageChange);

    return () => {
      darkModeQuery.removeEventListener("change", handleSystemChange);
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      followingSystemRef.current = false;
      chrome.storage.local.set({ theme: next }).catch(() => {});
      return next;
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
