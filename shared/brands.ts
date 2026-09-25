// Набор логотипов из Simple Icons (CC0). Берём только нужные, чтобы пульт был лёгким.
import {
  siObsstudio, siDiscord, siTwitch, siYoutube, siSpotify, siSteam, siTelegram, siGooglechrome, siKick,
  siVlcmediaplayer, siWhatsapp, siTiktok, siInstagram, siX, siGithub, siEpicgames, siNvidia, siRoblox, siVk,
  siSoundcloud, siReddit, siFigma, siBlender, siYoutubemusic, siApplemusic, siNetflix, siFirefoxbrowser,
  siBattledotnet, siUbisoft, siEa, siRiotgames, siValorant, siCounterstrike, siDota2, siPlaystation, siAmd,
  siIntel, siElgato, siStreamlabs, siOpera, siGogdotcom, siItchdotio, siGodotengine, siUnity, siUnrealengine,
  siObsidian, siNotion, siZoom, siViber, siMessenger, siFacebook, siBoosty, siPatreon,
} from 'simple-icons';

type SI = { title: string; path: string; hex: string };

const list: [string, SI][] = [
  ['obs', siObsstudio], ['discord', siDiscord], ['twitch', siTwitch], ['youtube', siYoutube], ['kick', siKick],
  ['spotify', siSpotify], ['ytmusic', siYoutubemusic], ['applemusic', siApplemusic], ['soundcloud', siSoundcloud],
  ['steam', siSteam], ['epic', siEpicgames], ['gog', siGogdotcom], ['itch', siItchdotio], ['battlenet', siBattledotnet],
  ['ubisoft', siUbisoft], ['ea', siEa], ['riot', siRiotgames], ['valorant', siValorant], ['cs', siCounterstrike],
  ['dota2', siDota2], ['roblox', siRoblox], ['playstation', siPlaystation], ['telegram', siTelegram],
  ['whatsapp', siWhatsapp], ['viber', siViber], ['vk', siVk], ['messenger', siMessenger], ['facebook', siFacebook],
  ['instagram', siInstagram], ['tiktok', siTiktok], ['x', siX], ['reddit', siReddit], ['boosty', siBoosty],
  ['patreon', siPatreon], ['chrome', siGooglechrome], ['firefox', siFirefoxbrowser], ['opera', siOpera],
  ['netflix', siNetflix], ['vlc', siVlcmediaplayer], ['github', siGithub], ['figma', siFigma], ['blender', siBlender],
  ['godot', siGodotengine], ['unity', siUnity], ['unreal', siUnrealengine], ['obsidian', siObsidian],
  ['notion', siNotion], ['zoom', siZoom], ['nvidia', siNvidia], ['amd', siAmd], ['intel', siIntel],
  ['elgato', siElgato], ['streamlabs', siStreamlabs],
];

export const BRANDS: Record<string, { title: string; path: string; hex: string }> = Object.fromEntries(
  list.map(([k, v]) => [k, { title: v.title, path: v.path, hex: '#' + v.hex }]),
);
