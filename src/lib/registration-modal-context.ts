import { createContext, useContext } from "react";

export type RegistrationModalCtx = {
  open: (packageId?: string, coreLessonTitle?: string) => void;
  selected: Set<string>;
  toggle: (id: string) => void;
  coreLesson?: string;
  coreSingleLessons: Set<number>;
  toggleLesson: (idx: number) => void;
  // Which core lessons (by 1-based index) currently show "בקרוב!" instead of
  // a real date — those can't be selected for a core_single purchase yet.
  coreLessonTbd: boolean[];
};

export const RegistrationModalContext = createContext<RegistrationModalCtx>({
  open: () => {},
  selected: new Set(),
  toggle: () => {},
  coreLesson: "",
  coreSingleLessons: new Set(),
  toggleLesson: () => {},
  coreLessonTbd: [],
});

export const useRegistrationModal = () => useContext(RegistrationModalContext);
