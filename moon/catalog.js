/* Coordinates are planetocentric degrees, north and east positive. */
(() => {
    'use strict';
    const tr = (ru, en) => ({ ru, en });
    const source = (ru, en, url) => ({ name: tr(ru, en), url });

    const catalog = [
        {
            id: 'apollo11',
            kind: 'mission',
            name: tr('Аполлон-11', 'Apollo 11'),
            status: tr('Пилотируемая посадка', 'Crewed landing'),
            date: tr('Посадка 20 июля 1969', 'Landed 20 July 1969'),
            participants: tr('NASA, США', 'NASA, United States'),
            location: tr('Море Спокойствия · 0,67416° с. ш., 23,47314° в. д.', 'Sea of Tranquility · 0.67416° N, 23.47314° E'),
            target: { type: 'landing', lat: 0.67416, lon: 23.47314 },
            description: tr(
                'Нил Армстронг и Базз Олдрин высадились на модуле «Игл», собрали образцы пород и установили научные приборы. На орбите их ждал Майкл Коллинз. Все трое вернулись на Землю 24 июля.',
                'Neil Armstrong and Buzz Aldrin landed in Eagle, collected rock samples and deployed scientific instruments. Michael Collins waited in lunar orbit. All three returned to Earth on 24 July.'
            ),
            sources: [
                source('LROC · место посадки и маршрут', 'LROC · landing site and traverse', 'https://lroc.im-ldi.com/featured_sites/apollo-11/simple-traverse'),
                source('NASA · миссия и экипаж', 'NASA · mission and crew', 'https://www.nasa.gov/mission/apollo-11/')
            ],
            model: {
                file: 'models/moon/apollo11.glb',
                kind: 'official',
                credit: tr('Лунный модуль Apollo · NASA, Michael D. Carbajal', 'Apollo Lunar Module · NASA, Michael D. Carbajal'),
                url: 'https://science.nasa.gov/3d-resources/apollo-lunar-module/'
            }
        },
        {
            id: 'luna17',
            kind: 'mission',
            name: tr('Луна-17 · Луноход-1', 'Luna 17 · Lunokhod 1'),
            status: tr('Посадка с луноходом', 'Rover delivery'),
            date: tr('Посадка 17 ноября 1970', 'Landed 17 November 1970'),
            participants: tr('СССР', 'Soviet Union'),
            location: tr('Море Дождей · 38,23764° с. ш., 35,00163° з. д.', 'Sea of Rains · 38.23764° N, 35.00163° W'),
            target: { type: 'landing', lat: 38.23764, lon: -35.00163 },
            description: tr(
                'Метка указывает посадочную платформу «Луны-17». С неё по трапам съехал «Луноход-1». Под управлением экипажа на Земле он прошёл по Морю Дождей более 10 км.',
                'The marker identifies the Luna 17 landing platform. Lunokhod 1 rolled down its ramps and travelled more than 10 km across the Sea of Rains under the control of a crew on Earth.'
            ),
            sources: [
                source('LROC · координаты платформы', 'LROC · platform coordinates', 'https://lroc.im-ldi.com/images/938'),
                source('LROC · платформа и луноход', 'LROC · lander and rover', 'https://lroc.im-ldi.com/images/402')
            ],
            model: {
                file: 'models/moon/luna17.glb',
                kind: 'reconstruction',
                credit: tr('Луноход-1 · Space Radar', 'Lunokhod 1 · Space Radar'),
                url: 'https://models.spaceradar.ai/lunokhod-1/'
            }
        },
        {
            id: 'change4',
            kind: 'mission',
            name: tr('Чанъэ-4', 'Chang’e 4'),
            status: tr('Посадка на обратной стороне', 'Far-side landing'),
            date: tr('Посадка 3 января 2019', 'Landed 3 January 2019'),
            participants: tr('Китай, CNSA · международные научные приборы', 'China, CNSA · international science payloads'),
            location: tr('Кратер Фон Карман · 45,4561° ю. ш., 177,5885° в. д.', 'Von Kármán crater · 45.4561° S, 177.5885° E'),
            target: { type: 'landing', lat: -45.4561, lon: 177.5885 },
            description: tr(
                '«Чанъэ-4» совершил первую мягкую посадку на обратной стороне Луны и доставил луноход «Юйту-2». Из кратера Фон Карман аппараты передавали данные на Землю через спутник-ретранслятор «Цюэцяо».',
                'Chang’e 4 made the first soft landing on the lunar far side and deployed the Yutu 2 rover. The lander and rover communicated with Earth from Von Kármán crater through the Queqiao relay satellite.'
            ),
            sources: [
                source('LROC · измерения места посадки', 'LROC · landing site measurements', 'https://lroc.im-ldi.com/images/1100'),
                source('CNSA · результаты миссии', 'CNSA · mission results', 'https://www.cnsa.gov.cn/english/n6465719/c6805233/content.html')
            ],
            model: {
                file: 'models/moon/change4.glb',
                kind: 'reconstruction',
                credit: tr('Посадочный аппарат «Чанъэ-4» · Space Radar', 'Chang’e 4 lander · Space Radar'),
                url: 'https://models.spaceradar.ai/change-4/'
            }
        },
        {
            id: 'ilrs',
            kind: 'station',
            name: tr('МНЛС', 'ILRS'),
            status: tr('Проект научной станции', 'Proposed research station'),
            date: tr('План CNSA от 24 апреля 2025', 'CNSA plan dated 24 April 2025'),
            participants: tr('Китай и Россия с международными партнёрами', 'China and Russia with international partners'),
            location: tr('Район южного полюса · площадка уточняется', 'South polar region · site to be determined'),
            // Pole coordinates center the camera on the region, without placing a station marker.
            target: { type: 'region', lat: -90, lon: 0 },
            description: tr(
                'Международная научная лунная станция задумана для длительных наблюдений, экспериментов и изучения местных ресурсов. План CNSA предусматривает наземную и орбитальную части. Цель первого этапа — создать базовую станцию у южного полюса к 2035 году.',
                'The International Lunar Research Station is designed for long-term observations, experiments and research into local resources. The CNSA plan includes surface and orbital facilities, with a target of 2035 for a basic station near the south pole.'
            ),
            sources: [
                source('CNSA · район и этапы проекта', 'CNSA · region and project phases', 'https://www.cnsa.gov.cn/english/n6465652/n6465653/c10670178/content.html'),
                source('CNSA и Роскосмос · совместное заявление', 'CNSA and Roscosmos · joint statement', 'https://www.cnsa.gov.cn/english/n6465668/n6465670/c6811967/content.html')
            ],
            model: {
                file: 'models/moon/ilrs.glb',
                kind: 'reconstruction',
                credit: tr('Поверхностная часть · «Рассвет», по материалам CNSA и Роскосмоса', 'Surface facilities · Rassvet, based on CNSA and Roscosmos materials'),
                url: 'https://www.cnsa.gov.cn/english/n6465645/n6465648/c6812150/content.html'
            }
        },
        {
            id: 'gateway',
            kind: 'station',
            name: tr('Gateway', 'Gateway'),
            status: tr('Разработка приостановлена', 'Development paused'),
            date: tr('По материалам NASA от 5 октября 2026', 'NASA report dated 5 October 2026'),
            participants: tr('NASA, ESA, JAXA, Канадское космическое агентство и Космический центр им. Мохаммеда бин Рашида (ОАЭ)', 'NASA, ESA, JAXA, Canadian Space Agency and Mohammed Bin Rashid Space Centre (UAE)'),
            location: tr('Проектная окололунная гало-орбита (NRHO)', 'Planned near-rectilinear halo orbit (NRHO)'),
            target: null,
            description: tr(
                'Станцию проектировали для работы экипажей на окололунной орбите и поддержки высадок. В проекте один виток занимал около 6,5 суток. В 2026 году NASA приостановило разработку Gateway в прежнем виде и переключилось на инфраструктуру лунной базы.',
                'Gateway was designed to host crews in lunar orbit and support surface expeditions. Its planned orbit had a period of about 6.5 days. In 2026 NASA paused Gateway development in its original form and shifted its focus to surface infrastructure.'
            ),
            sources: [
                source('NASA · статус программы', 'NASA · program status', 'https://ntrs.nasa.gov/citations/20260003168'),
                source('NASA · проект орбиты и участники', 'NASA · planned orbit and partners', 'https://www.nasa.gov/gateway-frequently-asked-questions/')
            ],
            model: {
                file: 'models/moon/gateway.glb',
                kind: 'official',
                credit: tr('NASA/JSC, Gateway Program Office · Alberto G. Bertolin и Bradley W. Reynolds', 'NASA/JSC, Gateway Program Office · Alberto G. Bertolin and Bradley W. Reynolds'),
                url: 'https://science.nasa.gov/3d-resources/gateway-lunar-space-station/'
            }
        }
    ];
    // Model preparation uniformly frames every GLB with the Y axis pointing up.
    for (const {model} of catalog) {
        model.center = [0, 0, 0];
        model.radius = 1;
        model.upAxis = 'Y';
    }
    window.RASSVET_MOON_CATALOG = catalog;
})();
