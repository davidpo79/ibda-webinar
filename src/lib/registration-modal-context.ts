import { createContext, useContext } from "react";

export type RegistrationModalCtx = {
  open: (packageId?: string, coreLessonTitle?: string) => void;
  selected: Set<string>;
  toggle: (id: string) => void;
  coreLesson?: string;
};

export const RegistrationModalContext = createContext<RegistrationModalCtx>({
  open: () => {},
  selected: new Set(),
  toggle: () => {},
  coreLesson: "",
});

export const useRegistrationModal = () => useContext(RegistrationModalContext);
