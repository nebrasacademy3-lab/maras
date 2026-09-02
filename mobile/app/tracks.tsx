import React from "react";
import { AppHeader } from "@/src/components/AppHeader";
import { LearningTracksList } from "@/src/components/LearningTracks";
import { Screen } from "@/src/components/ui";

export default function TracksScreen() {
  return <Screen><AppHeader title="المسارات القادمة" subtitle="خارطة ما ستطلقه مراس لاحقًا" back /><LearningTracksList /></Screen>;
}
