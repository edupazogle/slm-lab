"""Common given names (EN / FR / ES / DE / IT) for the PERSON first-name cue — written by hand for E1a, no dataset copied.

Lower-case, accents stripped (the cue compares `words[0].lower()` after NFD + removing combining marks, as the page does).
Deliberately left out: given names that are also common words, places or brands in claim text (will, hope, joy, grace,
may, june, april, august, rose, angel, guy, florence, nancy, lorraine, chelsea, jordan, georgia, austin, santiago,
salvador, lourdes, mercedes), because the first-name cue is checked BEFORE the page's "in/at/near …" place skip.
"""

EXTRA_FIRST_NAMES = {
    'en': """
aaron adrian alan albert alexander alfie andrew anthony archie arthur barry blake bradley brandon brian callum cameron
carl charlie chris christopher colin connor craig dale darren dean dennis derek dominic douglas duncan dylan edward
elliot ethan evan finn frederick gareth gary gavin geoffrey gerald gordon graham gregory harold harrison harry harvey
henry howard ian isaac jack jacob jake jamie jason jeffrey jeremy jerry jesse joe joel jonathan joseph joshua justin
keith kenneth kevin kieran kyle lee leon lewis liam logan luke malcolm matthew mason neil nathan nicholas nigel noel
oliver owen philip raymond reece richard ricky robin roger ronald ross russell ryan samuel scott sean shane spencer
stanley stephen steven stuart terence terry timothy toby tom tony travis trevor tyler vernon wayne zachary
abigail alexandra alison amanda amelia amy ann annie ashley barbara beatrice becky bethany beverley brenda bridget
caitlin carol carolyn cassandra cheryl christina cindy claudia courtney cynthia daisy danielle deborah denise diana
diane donna dorothy eleanor elizabeth ellie emily erin evelyn fiona frances freya gemma gillian gloria hannah harriet
hazel heather helen holly imogen irene isla jacqueline jane janet janice jennifer jenny jill joan joanna jodie
josephine joyce judith karen kate katherine kathleen kathryn katie kayla kelly kimberly kirsty lauren leah linda
lindsay lisa lucy lydia lynn madeleine maisie margaret marilyn martha mary megan melanie melissa michelle mildred
millie miranda molly monica naomi natalie nicola nicole olivia pamela patricia pauline penelope phoebe poppy rachel
rhiannon rita samantha sandra scarlett shannon sharon sheila shirley sophia stacey susan tamsin tara teresa tiffany
tracey vanessa veronica victoria wendy yvonne
""",
    'fr': """
adele adrien agathe albane alexis alix amandine anais andre anouk apolline audrey augustin axel baptiste bastien
benedicte benoit blanche brigitte capucine celine chantal clarisse clement clementine colette corentin damien delphine
denis didier eloise elodie emile emmanuel enzo estelle etienne eugenie fabienne fanny francoise frederic gaelle
gaspard genevieve gerard gilles gisele gregoire herve honore ines jerome jocelyne josiane laetitia laurent leonie
lionel lou loic lucien ludovic manon marcel marguerite martine mathilde maurice mireille monique morgane nadine
oceane odile philippine quentin regine remi renaud romane sandrine serge severine simone solene sylvain tanguy
thibault thierry timothee valentin veronique yannick yvette yvon zacharie armand aurelien cedric celestin cyril
christophe dorian francis gael gauthier ghislain hugues jeremie killian marius mathis matthias maxence noe raoul rene
sacha sylvestre ursule victorine youssef mohamed karim sofiane yasmine
""",
    'es': """
alba alejandro alicia alfonso alvaro amparo andres antonia beatriz blanca carmen cesar concepcion consuelo cristina
cristobal diego dolores eduardo emilio enrique esperanza esteban federico francisco gonzalo guadalupe guillermo
ignacio inmaculada jaime jesus joaquin jordi josefa julian leticia lorena lorenzo manuel manuela marcos margarita
montserrat natalia nerea nieves nuria patricio pilar rafael ramon raquel ricardo roberto rocio rodrigo rosario ruben
sergio silvia soledad susana vicente ximena yolanda alberto almudena arantxa borja camila catalina clemente elvira
encarnacion fernanda gabriela hector iker inigo marta martina milagros oriol paloma remedios sonia valeria
""",
    'de': """
anja annika bernd birgit bettina christa christoph dagmar dieter dirk doris elke ernst friedrich fritz gabriele
gerhard gisela gudrun gunter hanna hannelore heike heinz helga helmut herbert hildegard holger horst ingrid jana
joachim jorg jurgen karin katrin kerstin konrad lars lothar manfred maren marlene meike monika nils norbert ottilie
petra rainer ralf reinhard renate rolf sabine silke stefanie steffen susanne sven thorsten torsten ursula uwe volker
walter werner wolfgang dietmar elfriede emil frieda greta hannes heinrich ilse jannik kai lina luise magdalena
maximilian mia moritz niklas ole paulina wilhelm leni
""",
    'it': """
alessandra alessandro alessio aldo alfredo angelo antonella arianna benedetta carlo carmela caterina cesare chiara
claudio cristiano daniela dario davide domenico donatella edoardo elisabetta emanuele enrico ettore fabio fabrizio
federica filippo franco gaetano giacomo gianluca gianni giorgia giorgio giovanna giovanni graziella ilaria lorenza
loredana luciano lucrezia marcello margherita mariangela massimo matilde maurizio michela michele mirko nicoletta
orazio ornella pasquale patrizia piero pietro raffaele renata riccardo roberta rocco rosalia sandro serena silvio
simona stefania stefano tiziana tommaso umberto valerio vittoria vittorio
""",
}

EXTRA_FIRST = set()
for _lang, _block in EXTRA_FIRST_NAMES.items():
    EXTRA_FIRST.update(_block.split())

assert all(n.isascii() and n.isalpha() and n == n.lower() for n in EXTRA_FIRST), 'names must be lower-case ASCII'
