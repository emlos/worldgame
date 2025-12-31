const PlayerFlags = {
    P_Injured: "injured",
    P_Package: "waitingForPackage"
};

const NPCFlags = {
    Taylor_injured: "taylor-injured",
};

export const Flags = {
    ...NPCFlags,
    ...PlayerFlags,
};
