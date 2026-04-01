"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type Locale = "en" | "pt";

const translations = {
  en: {
    // Navigation
    dashboard: "Dashboard",
    students: "Students",
    programs: "Programs",
    exercises: "Exercises",
    progress: "Progress",
    myProfile: "My Profile",
    logout: "Logout",
    newProgram: "New Program",
    notifications: "Notifications",
    markAllAsRead: "Mark all as read",

    // Student Navigation
    myDashboard: "My Dashboard",
    workouts: "Workouts",
    billing: "Billing",
    profile: "Profile",
    messages: "Messages",
    exerciseHistory: "Exercise History",

    // Dashboard
    welcomeCoach: "Welcome, Coach",
    overviewDescription: "Here's an overview of your training squad's performance.",
    manageRoster: "Manage Roster",
    portalStudents: "Portal students",
    onYourRoster: "on your roster",
    avgStreak: "Avg. Streak",
    rosterOnly: "Roster only",
    goalSuccess: "Goal Success",
    targetWeightsReached: "Target weights reached",
    assignments: "Assignments",
    totalAssignedWorkouts: "Total assigned workouts",
    upcomingAssignments: "Upcoming Assignments",
    nextScheduledWorkouts: "Next scheduled workouts",
    today: "Today",
    openDirectory: "Open directory",
    noStudentsYet: "No students in the portal yet.",
    studentDirectory: "Student directory",
    assignmentCalendar: "Assignment Calendar",
    selectDateToSee: "Select a date to see assigned workouts",
    noAssignmentsOnDate: "No assignments on this date.",
    workoutDetails: "Workout Details",
    editWorkout: "Edit Workout",
    assignedTo: "Assigned to",
    edit: "Edit",
    delete: "Delete",
    viewStudentProfile: "View Student Profile",
    cancel: "Cancel",
    saveChanges: "Save Changes",
    addExercise: "+ Add Exercise",
    workoutTitle: "Workout Title",
    date: "Date",
    time: "Time",
    sets: "Sets",
    reps: "Reps",
    weight: "Weight",
    weightKg: "Weight (kg)",
    rest: "Rest (s)",

    // Builder
    buildProgram: "Build Program",
    assignment: "Assignment",
    whoIsThisFor: "Who is this for?",
    selectStudent: "Select Student",
    selectFromRoster: "Select from roster",
    workoutDate: "Workout Date",
    workoutTime: "Workout Time",
    routineSteps: "Routine Steps",
    exercisesTotal: "exercises total",
    exerciseName: "Exercise name",
    notes: "Notes",
    saveToLibrary: "Save to library",
    saveChangesBtn: "Save changes",
    assignProgram: "Assign Program",
    noStudentsFound: "No students found",

    // Student Detail
    memberSince: "Member since",
    ageSex: "Age / Sex",
    height: "Height",
    goal: "Goal",
    workoutHistory: "Workout History",
    sessionsCompleted: "sessions completed",
    sessionCompleted: "session completed",
    completed: "Completed",
    noWorkoutSessions: "No workout sessions recorded yet.",
    currentStreak: "Current Streak",
    keepMomentum: "Keep the momentum going!",
    subscription: "Subscription",
    lastActive: "Last Active",
    noRecentActivity: "No recent activity",
    loggedSession: "Logged session",
    coachingManagement: "Coaching & Management",
    trainerNotes: "Trainer Observations & Notes",
    privateNotes: "Private notes only visible to you.",
    saveCoachingNotes: "Save Coaching Notes",
    adjustGoals: "Adjust Goals",
    updateTargetMetrics: "Update target metrics for this student.",
    goalWeight: "Goal Weight (kg)",
    goalType: "Goal Type",
    updateTargets: "Update Targets",
    assignedWorkouts: "Assigned Workouts",
    noWorkoutsAssigned: "No workouts assigned yet.",
    assignWorkout: "Assign Workout",
    active: "Active",
    portal: "Portal",

    // Billing
    billingSettings: "Billing Settings",
    billingDescription: "Set the monthly rate and payment method for this student",
    monthlyRate: "Monthly Rate (€)",
    paymentMethod: "Payment Method",
    mbway: "MB WAY",
    bankTransfer: "Bank Transfer",
    cash: "Cash",
    paymentInstructions: "Payment Instructions (visible to student)",
    saveSettings: "Save Settings",
    paymentHistory: "Payment History",
    recordPayments: "Record payments from this student",
    recordPayment: "Record Payment",
    newPayment: "New Payment",
    period: "Period",
    amount: "Amount (€)",
    method: "Method",
    status: "Status",
    paid: "Paid",
    pending: "Pending",
    savePayment: "Save Payment",
    noPaymentsRecorded: "No payments recorded yet.",

    // Student Dashboard
    myWorkouts: "My Workouts",
    startWorkout: "Start Workout",
    myProgress: "My Progress",
    myBilling: "My Billing",

    // Common
    loading: "Loading...",
    save: "Save",
    back: "Back",
    search: "Search",
    close: "Close",
    confirm: "Confirm",
    days: "Days",
    yrs: "yrs",
    male: "Male",
    female: "Female",
    other: "Other",
    language: "Language",
    english: "English",
    portuguese: "Português",
    editSession: "Edit Session",
    deleteSession: "Delete Session",
    addSet: "+ Add Set",
    sessionUpdated: "Session updated",
    sessionDeleted: "Session deleted",
    workoutRemoved: "Workout removed",
    workoutUpdated: "Workout updated",
    programAssigned: "Program Assigned!",
    billingSettingsSaved: "Billing settings saved",
    paymentRecorded: "Payment recorded",
    profileUpdated: "Profile Updated",
    addToMyRoster: "Add to my roster",
    addedToRoster: "Added to your roster",
  },

  pt: {
    // Navigation
    dashboard: "Painel",
    students: "Alunos",
    programs: "Programas",
    exercises: "Exercícios",
    progress: "Progresso",
    myProfile: "Meu Perfil",
    logout: "Sair",
    newProgram: "Novo Programa",
    notifications: "Notificações",
    markAllAsRead: "Marcar tudo como lido",

    // Student Navigation
    myDashboard: "Meu Painel",
    workouts: "Treinos",
    billing: "Faturação",
    profile: "Perfil",
    messages: "Mensagens",
    exerciseHistory: "Historico de Exercicios",

    // Dashboard
    welcomeCoach: "Bem-vindo, Treinador",
    overviewDescription: "Aqui está um resumo do desempenho da sua equipa de treino.",
    manageRoster: "Gerir Lista",
    portalStudents: "Alunos no portal",
    onYourRoster: "na sua lista",
    avgStreak: "Média Consecutiva",
    rosterOnly: "Apenas na lista",
    goalSuccess: "Sucesso do Objetivo",
    targetWeightsReached: "Pesos-alvo alcançados",
    assignments: "Atribuições",
    totalAssignedWorkouts: "Total de treinos atribuídos",
    upcomingAssignments: "Próximas Atribuições",
    nextScheduledWorkouts: "Próximos treinos agendados",
    today: "Hoje",
    openDirectory: "Abrir diretório",
    noStudentsYet: "Ainda não há alunos no portal.",
    studentDirectory: "Diretório de alunos",
    assignmentCalendar: "Calendário de Atribuições",
    selectDateToSee: "Selecione uma data para ver os treinos atribuídos",
    noAssignmentsOnDate: "Sem atribuições nesta data.",
    workoutDetails: "Detalhes do Treino",
    editWorkout: "Editar Treino",
    assignedTo: "Atribuído a",
    edit: "Editar",
    delete: "Eliminar",
    viewStudentProfile: "Ver Perfil do Aluno",
    cancel: "Cancelar",
    saveChanges: "Guardar Alterações",
    addExercise: "+ Adicionar Exercício",
    workoutTitle: "Título do Treino",
    date: "Data",
    time: "Hora",
    sets: "Séries",
    reps: "Repetições",
    weight: "Peso",
    weightKg: "Peso (kg)",
    rest: "Descanso (s)",

    // Builder
    buildProgram: "Criar Programa",
    assignment: "Atribuição",
    whoIsThisFor: "Para quem é?",
    selectStudent: "Selecionar Aluno",
    selectFromRoster: "Selecionar da lista",
    workoutDate: "Data do Treino",
    workoutTime: "Hora do Treino",
    routineSteps: "Passos da Rotina",
    exercisesTotal: "exercícios no total",
    exerciseName: "Nome do exercício",
    notes: "Notas",
    saveToLibrary: "Guardar na biblioteca",
    saveChangesBtn: "Guardar alterações",
    assignProgram: "Atribuir Programa",
    noStudentsFound: "Nenhum aluno encontrado",

    // Student Detail
    memberSince: "Membro desde",
    ageSex: "Idade / Sexo",
    height: "Altura",
    goal: "Objetivo",
    workoutHistory: "Histórico de Treinos",
    sessionsCompleted: "sessões concluídas",
    sessionCompleted: "sessão concluída",
    completed: "Concluído",
    noWorkoutSessions: "Ainda não há sessões de treino registadas.",
    currentStreak: "Sequência Atual",
    keepMomentum: "Mantenha o ritmo!",
    subscription: "Subscrição",
    lastActive: "Última Atividade",
    noRecentActivity: "Sem atividade recente",
    loggedSession: "Sessão registada",
    coachingManagement: "Treino e Gestão",
    trainerNotes: "Observações e Notas do Treinador",
    privateNotes: "Notas privadas visíveis apenas para si.",
    saveCoachingNotes: "Guardar Notas",
    adjustGoals: "Ajustar Objetivos",
    updateTargetMetrics: "Atualizar métricas-alvo para este aluno.",
    goalWeight: "Peso Objetivo (kg)",
    goalType: "Tipo de Objetivo",
    updateTargets: "Atualizar Objetivos",
    assignedWorkouts: "Treinos Atribuídos",
    noWorkoutsAssigned: "Ainda não há treinos atribuídos.",
    assignWorkout: "Atribuir Treino",
    active: "Ativo",
    portal: "Portal",

    // Billing
    billingSettings: "Definições de Faturação",
    billingDescription: "Defina a mensalidade e o método de pagamento para este aluno",
    monthlyRate: "Mensalidade (€)",
    paymentMethod: "Método de Pagamento",
    mbway: "MB WAY",
    bankTransfer: "Transferência Bancária",
    cash: "Dinheiro",
    paymentInstructions: "Instruções de Pagamento (visível para o aluno)",
    saveSettings: "Guardar Definições",
    paymentHistory: "Histórico de Pagamentos",
    recordPayments: "Registar pagamentos deste aluno",
    recordPayment: "Registar Pagamento",
    newPayment: "Novo Pagamento",
    period: "Período",
    amount: "Montante (€)",
    method: "Método",
    status: "Estado",
    paid: "Pago",
    pending: "Pendente",
    savePayment: "Guardar Pagamento",
    noPaymentsRecorded: "Ainda não há pagamentos registados.",

    // Student Dashboard
    myWorkouts: "Meus Treinos",
    startWorkout: "Iniciar Treino",
    myProgress: "Meu Progresso",
    myBilling: "Minha Faturação",

    // Common
    loading: "A carregar...",
    save: "Guardar",
    back: "Voltar",
    search: "Pesquisar",
    close: "Fechar",
    confirm: "Confirmar",
    days: "Dias",
    yrs: "anos",
    male: "Masculino",
    female: "Feminino",
    other: "Outro",
    language: "Idioma",
    english: "English",
    portuguese: "Português",
    editSession: "Editar Sessão",
    deleteSession: "Eliminar Sessão",
    addSet: "+ Adicionar Série",
    sessionUpdated: "Sessão atualizada",
    sessionDeleted: "Sessão eliminada",
    workoutRemoved: "Treino removido",
    workoutUpdated: "Treino atualizado",
    programAssigned: "Programa Atribuído!",
    billingSettingsSaved: "Definições de faturação guardadas",
    paymentRecorded: "Pagamento registado",
    profileUpdated: "Perfil Atualizado",
    addToMyRoster: "Adicionar à minha lista",
    addedToRoster: "Adicionado à sua lista",
  },
} as const;

export type TranslationKey = keyof typeof translations.en;

type I18nContextType = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
};

const I18nContext = createContext<I18nContextType>({
  locale: "en",
  setLocale: () => {},
  t: (key) => key,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const saved = localStorage.getItem("elevateFit-locale") as Locale | null;
    if (saved && (saved === "en" || saved === "pt")) {
      setLocaleState(saved);
    }
  }, []);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    localStorage.setItem("elevateFit-locale", l);
  };

  const t = (key: TranslationKey): string => {
    return translations[locale][key] || translations.en[key] || key;
  };

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
