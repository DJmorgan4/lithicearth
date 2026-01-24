import { ZeusAvatar, HerculesAvatar, QuetzalcoatlAvatar } from "../components/avatars/HeroAvatars";

export const heroes = [
  {
    id: "zeus",
    name: "Zeus",
    title: "King of Olympus",
    description:
      "Master of the skies. Zeus reveals astronomical alignments and divine connections between ancient sites.",
    accent: "#5AA7FF",
    Avatar: ZeusAvatar,
  },
  {
    id: "hercules",
    name: "Hercules",
    title: "The Original Hero",
    description:
      "Legendary strongman. Hercules reveals how ancient peoples moved massive stones.",
    accent: "#FFB020",
    Avatar: HerculesAvatar,
  },
  {
    id: "quetzalcoatl",
    name: "Quetzalcoatl",
    title: "Feathered Serpent God",
    description:
      "Ancient astronomer-priest. Quetzalcoatl decodes astronomical calendars.",
    accent: "#20E3A2",
    Avatar: QuetzalcoatlAvatar,
  },
] as const;


export const getAllHeroes = () => heroes;
