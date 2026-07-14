import { createContext, useContext } from "react";

export type RegistrationModalCtx = {
  open: (packageId?: string, coreLessonTitle?: string) => void;
  selected: Set<string>;
  toggle: (id: string) => void;
  coreLesson?: string;
  coreSingleLessons: Set<number>;
  toggleLesson: (idx: number) => void;
};

export const RegistrationModalContext = createContext<RegistrationModalCtx>({
  open: () => {},
  selected: new Set(),
  toggle: () => {},
  coreLesson: "",
  coreSingleLessons: new Set(),
  toggleLesson: () => {},
});

export const useRegistrationModal = () => useContext(RegistrationModalContext);
