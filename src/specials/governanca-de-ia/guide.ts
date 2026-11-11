// Module script of the AI governance guide (3-22). Every piece is an enhancement: the text, tables and diagrams read
// whole without it.
import { initHero } from './hero';
import { initArch } from './arch';
import { initChain, initRoutes, initYaml } from './interactions';
import { initScheme } from './scheme';

initScheme();
initHero();
initChain();
initYaml();
initRoutes();
initArch();
